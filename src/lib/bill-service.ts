import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { recordAuditLog } from "@/lib/audit-service";
import { buildBillSnapshot, parseBillSnapshot, receiptFromBillSnapshot } from "@/lib/bill-snapshot";
import { financialsForOrder } from "@/lib/order-financials";
import { logInfo, logWarn } from "@/lib/logger";
import { enqueueCustomerBillPrintInTx, enqueueIdempotentPrintJob } from "@/domains/printing/print-job-service";
import { customerBillIdempotencyKey, PRINT_KIND, targetFromKind } from "@/lib/print-constants";
import { generatePublicToken } from "@/lib/public-token";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/platform/forensics/constants";
import { appendPlatformAuditEventInTx } from "@/platform/forensics/platform-audit-service";
import { setForensicCorrelationId, setForensicResource } from "@/platform/forensics/request-context";

const BILL_RESTAURANT_SELECT = {
  name: true,
  logoUrl: true,
  receiptAddress: true,
  receiptPhone: true,
  receiptGstin: true,
  receiptGstEnabled: true,
  receiptGstRate: true,
  receiptFooter: true,
  tenantId: true,
} as const;

const BILL_NUMBER_ATTEMPTS = 8;

type BillingDb = Prisma.TransactionClient | typeof prisma;

function billDateStamp(timeZone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "");
}

function formatBillNumber(dateStamp: string, sequence: number) {
  return `${dateStamp}-${String(sequence).padStart(4, "0")}`;
}

export function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === "P2002") return true;
  const message = "message" in error ? String(error.message) : "";
  if (/UNIQUE constraint failed/i.test(message)) return true;
  if ("cause" in error) return isUniqueConstraintError(error.cause);
  return false;
}

export async function runWithUniqueConstraintRetry<T>(
  work: () => Promise<T>,
  attempts = BILL_NUMBER_ATTEMPTS,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      if (isUniqueConstraintError(error) && attempt < attempts - 1) {
        logWarn("billing", "Unique constraint collision, retrying transaction", {
          attempt: attempt + 1,
        });
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

async function nextBillNumber(db: BillingDb, restaurantId: string, dateStamp: string) {
  const latest = await db.bill.findFirst({
    where: { restaurantId, billNumber: { startsWith: `${dateStamp}-` } },
    orderBy: { billNumber: "desc" },
    select: { billNumber: true },
  });
  const lastSeq = latest ? Number(latest.billNumber.split("-")[1] ?? "0") : 0;
  return formatBillNumber(dateStamp, Number.isFinite(lastSeq) ? lastSeq + 1 : 1);
}

export async function getBillForOrder(orderId: string, restaurantId: string) {
  return prisma.bill.findFirst({
    where: { orderId, restaurantId },
  });
}

export async function finalizeOrderBillInTx(
  tx: BillingDb,
  params: {
    orderId: string;
    restaurantId: string;
    actorUserId?: string;
    actorName?: string;
  },
) {
  const existing = await tx.bill.findFirst({
    where: { orderId: params.orderId, restaurantId: params.restaurantId },
  });
  if (existing) {
    if (existing.status === "VOIDED") {
      return { ok: false as const, error: "Bill is voided", status: 409, bill: existing };
    }
    return { ok: true as const, bill: existing, created: false };
  }

  const order = await tx.order.findFirst({
    where: { id: params.orderId, restaurantId: params.restaurantId },
    include: {
      items: true,
      payments: true,
      table: { select: { number: true } },
      restaurant: { select: BILL_RESTAURANT_SELECT },
      branch: { select: { name: true, address: true, timezone: true } },
    },
  });
  if (!order) return { ok: false as const, error: "Order not found", status: 404 };

  const financials = financialsForOrder({
    items: order.items,
    discountAmount: order.discountAmount,
    payments: [],
    gstEnabled: order.restaurant.receiptGstEnabled,
    gstRate: order.restaurant.receiptGstRate,
  });

  const dateStamp = billDateStamp(order.branch?.timezone ?? "Asia/Kolkata");
  const finalizedAt = new Date();

  for (let attempt = 0; attempt < BILL_NUMBER_ATTEMPTS; attempt += 1) {
    const raced = await tx.bill.findFirst({
      where: { orderId: params.orderId, restaurantId: params.restaurantId },
    });
    if (raced) {
      if (raced.status === "VOIDED") {
        return { ok: false as const, error: "Bill is voided", status: 409, bill: raced };
      }
      return { ok: true as const, bill: raced, created: false };
    }

    const billNumber = await nextBillNumber(tx, order.restaurantId, dateStamp);
    const snapshot = buildBillSnapshot({
      billNumber,
      restaurant: order.restaurant,
      branch: order.branch,
      order,
      financials,
      finalizedAt,
    });

    try {
      const bill = await tx.bill.create({
        data: {
          tenantId: order.tenantId ?? order.restaurant.tenantId,
          restaurantId: order.restaurantId,
          branchId: order.branchId,
          orderId: order.id,
          billNumber,
          publicToken: generatePublicToken(),
          status: "FINALIZED",
          snapshot: JSON.stringify(snapshot),
          itemSubtotal: financials.itemSubtotal,
          orderDiscount: financials.orderDiscount,
          gstAmount: financials.gstAmount,
          cgstAmount: financials.cgstAmount,
          sgstAmount: financials.sgstAmount,
          grandTotal: financials.grandTotal,
          finalizedAt,
          finalizedByUserId: params.actorUserId,
          finalizedByName: params.actorName,
        },
      });

      logInfo("billing", "Bill finalized", {
        tenantId: bill.tenantId,
        restaurantId: bill.restaurantId,
        orderId: bill.orderId,
        billId: bill.id,
        billNumber: bill.billNumber,
      });

      await enqueueCustomerBillPrintInTx(tx, {
        restaurantId: bill.restaurantId,
        tenantId: bill.tenantId,
        branchId: bill.branchId,
        orderId: bill.orderId,
        billId: bill.id,
        payload: snapshot,
      });
      setForensicCorrelationId(bill.id);
      setForensicResource({ type: "Bill", id: bill.id, label: bill.billNumber });
      await appendPlatformAuditEventInTx(tx, {
        category: AUDIT_CATEGORY.MONEY,
        action: AUDIT_ACTION.BILL_FINALIZED,
        restaurantId: bill.restaurantId,
        tenantId: bill.tenantId,
        branchId: bill.branchId,
        resourceType: "Bill",
        resourceId: bill.id,
        resourceLabel: bill.billNumber,
        correlationId: bill.id,
        after: {
          billNumber: bill.billNumber,
          grandTotalPaise: Math.round(Number(bill.grandTotal) * 100),
          currency: "INR",
          orderId: bill.orderId,
        },
      });

      return { ok: true as const, bill, created: true };
    } catch (error) {
      const existingAfter = await tx.bill.findFirst({
        where: { orderId: params.orderId, restaurantId: params.restaurantId },
      });
      if (existingAfter) {
        return { ok: true as const, bill: existingAfter, created: false };
      }
      if (isUniqueConstraintError(error) && attempt < BILL_NUMBER_ATTEMPTS - 1) {
        logWarn("billing", "Bill number collision, retrying", {
          restaurantId: order.restaurantId,
          attempt: attempt + 1,
        });
        continue;
      }
      throw error;
    }
  }

  return { ok: false as const, error: "Could not allocate a bill number", status: 500 };
}

export async function publishBillFinalized(params: {
  bill: {
    id: string;
    tenantId: string | null;
    restaurantId: string;
    branchId: string | null;
    orderId: string;
    billNumber: string;
    grandTotal: number;
    snapshot: string;
  };
  created: boolean;
  actorUserId?: string;
  actorName?: string;
}) {
  if (!params.created) return;
  await recordAuditLog({
    restaurantId: params.bill.restaurantId,
    actionType: "BILL_FINALIZED",
    entityId: params.bill.id,
    payload: {
      orderId: params.bill.orderId,
      billNumber: params.bill.billNumber,
      grandTotal: params.bill.grandTotal,
    },
    actorUserId: params.actorUserId,
    actorName: params.actorName,
    branchId: params.bill.branchId,
  });

  const snapshot = parseBillSnapshot(params.bill.snapshot);
  void enqueueIdempotentPrintJob({
    restaurantId: params.bill.restaurantId,
    tenantId: params.bill.tenantId,
    branchId: params.bill.branchId,
    orderId: params.bill.orderId,
    kind: PRINT_KIND.CUSTOMER_BILL,
    target: targetFromKind(PRINT_KIND.CUSTOMER_BILL),
    idempotencyKey: customerBillIdempotencyKey(params.bill.id),
    payload: snapshot ?? { billId: params.bill.id, billNumber: params.bill.billNumber },
  }).catch(() => undefined);
}

export async function finalizeOrderBill(params: {
  orderId: string;
  restaurantId: string;
  actorUserId?: string;
  actorName?: string;
}) {
  const result = await runWithUniqueConstraintRetry(() =>
    prisma.$transaction((tx) => finalizeOrderBillInTx(tx, params)),
  );
  if (result.ok) {
    await publishBillFinalized({
      bill: result.bill,
      created: result.created,
      actorUserId: params.actorUserId,
      actorName: params.actorName,
    });
  }
  return result;
}

export async function voidOrderBill(params: {
  orderId: string;
  restaurantId: string;
  reason?: string;
  actorUserId?: string;
  actorName?: string;
}) {
  const bill = await prisma.bill.findFirst({
    where: { orderId: params.orderId, restaurantId: params.restaurantId },
  });
  if (!bill) return { ok: false as const, error: "Bill not found", status: 404 };
  if (bill.status === "VOIDED") return { ok: true as const, bill };

  const updated = await prisma.bill.update({
    where: { id: bill.id },
    data: {
      status: "VOIDED",
      voidedAt: new Date(),
      voidedByUserId: params.actorUserId,
      voidedByName: params.actorName,
      voidReason: params.reason ?? null,
    },
  });

  logInfo("billing", "Bill voided", {
    tenantId: updated.tenantId,
    restaurantId: updated.restaurantId,
    orderId: updated.orderId,
    billId: updated.id,
  });

  await recordAuditLog({
    restaurantId: updated.restaurantId,
    actionType: "BILL_VOIDED",
    entityId: updated.id,
    reason: params.reason,
    payload: { orderId: updated.orderId, billNumber: updated.billNumber, grandTotal: updated.grandTotal },
    actorUserId: params.actorUserId,
    actorName: params.actorName,
    branchId: updated.branchId,
  });

  return { ok: true as const, bill: updated };
}

export function receiptFromBillRow(bill: { snapshot: string; billNumber: string }) {
  const snapshot = parseBillSnapshot(bill.snapshot);
  if (!snapshot) return null;
  return receiptFromBillSnapshot({ ...snapshot, billNumber: bill.billNumber });
}

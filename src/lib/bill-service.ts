import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit-service";
import { buildBillSnapshot, parseBillSnapshot, receiptFromBillSnapshot } from "@/lib/bill-snapshot";
import { financialsForOrder } from "@/lib/order-financials";
import { logInfo, logWarn } from "@/lib/logger";
import { enqueueIdempotentPrintJob } from "@/domains/printing/print-job-service";

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

async function nextBillNumber(restaurantId: string, dateStamp: string) {
  const latest = await prisma.bill.findFirst({
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

export async function finalizeOrderBill(params: {
  orderId: string;
  restaurantId: string;
  actorUserId?: string;
  actorName?: string;
}) {
  const existing = await prisma.bill.findFirst({
    where: { orderId: params.orderId, restaurantId: params.restaurantId },
  });
  if (existing) {
    if (existing.status === "VOIDED") {
      return { ok: false as const, error: "Bill is voided", status: 409, bill: existing };
    }
    return { ok: true as const, bill: existing, created: false };
  }

  const order = await prisma.order.findFirst({
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
  let billNumber = await nextBillNumber(order.restaurantId, dateStamp);
  const finalizedAt = new Date();
  const snapshot = buildBillSnapshot({
    billNumber,
    restaurant: order.restaurant,
    branch: order.branch,
    order,
    financials,
    finalizedAt,
  });

  try {
    const bill = await prisma.bill.create({
      data: {
        tenantId: order.tenantId ?? order.restaurant.tenantId,
        restaurantId: order.restaurantId,
        branchId: order.branchId,
        orderId: order.id,
        billNumber,
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

    await recordAuditLog({
      restaurantId: bill.restaurantId,
      actionType: "BILL_FINALIZED",
      entityId: bill.id,
      payload: { orderId: bill.orderId, billNumber: bill.billNumber, grandTotal: bill.grandTotal },
      actorUserId: params.actorUserId,
      actorName: params.actorName,
      branchId: bill.branchId,
    });

    void enqueueIdempotentPrintJob({
      restaurantId: bill.restaurantId,
      tenantId: bill.tenantId,
      branchId: bill.branchId,
      orderId: bill.orderId,
      kind: "customer_bill",
      idempotencyKey: `bill:${bill.id}:customer_bill`,
      payload: snapshot,
    }).catch(() => undefined);

    return { ok: true as const, bill, created: true };
  } catch (error) {
    const raced = await prisma.bill.findFirst({
      where: { orderId: params.orderId, restaurantId: params.restaurantId },
    });
    if (raced) return { ok: true as const, bill: raced, created: false };
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      billNumber = await nextBillNumber(order.restaurantId, dateStamp);
      logWarn("billing", "Bill number collision, retrying", {
        restaurantId: order.restaurantId,
        billNumber,
      });
    }
    throw error;
  }
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

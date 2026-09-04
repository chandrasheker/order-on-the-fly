import { prisma } from "@/lib/prisma";
import type { PaymentMethod } from "@/generated/prisma/client";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/platform/forensics/constants";
import { appendPlatformAuditEventInTx } from "@/platform/forensics/platform-audit-service";
import { auditPaymentSnapshot } from "@/platform/forensics/snapshots";
import { setForensicCorrelationId, setForensicResource } from "@/platform/forensics/request-context";
import { clearPaymentAlerts } from "@/lib/payment-service";
import { orderItemLineTotal } from "@/lib/utils";
import { fromPaise, maxPaise, minPaise, toPaise } from "@/lib/money";
import {
  FINANCIAL_PAID_EPSILON,
  MANUAL_UPI_VERIFICATION,
  PAYMENT_STATUS,
  financialsForOrder,
  isCapturedPayment,
  type OrderFinancialSummary,
} from "@/lib/order-financials";
import {
  finalizeOrderBillInTx,
  publishBillFinalized,
  runWithUniqueConstraintRetry,
} from "@/lib/bill-service";
import { logInfo } from "@/lib/logger";
import { recordAuditLog } from "@/lib/audit-service";

type OrderItemRow = {
  id: string;
  quantity: number;
  unitPrice: number;
  status: string;
  itemName: string;
};

export async function getItemPaidAmount(orderItemId: string) {
  const allocations = await prisma.paymentAllocation.aggregate({
    where: { orderItemId },
    _sum: { amount: true },
  });
  return allocations._sum.amount ?? 0;
}

export async function orderItemHasPayment(orderItemId: string) {
  const paid = await getItemPaidAmount(orderItemId);
  return paid > 0.01;
}

function computeSummaryFromOrder(
  order: {
    id: string;
    orderNumber: number;
    tableId: string;
    status: string;
    paidAt: Date | null;
    items: OrderItemRow[];
    discountAmount?: number | null;
    restaurant?: { receiptGstEnabled: boolean; receiptGstRate: number };
    bills?: Array<{
      status: string;
      itemSubtotal: number;
      orderDiscount: number;
      gstAmount: number;
      cgstAmount: number;
      sgstAmount: number;
      grandTotal: number;
    }>;
    payments: Array<{
      id: string;
      amount: number;
      method: PaymentMethod;
      status?: string | null;
      verificationStatus?: string | null;
      provider?: string | null;
      note: string | null;
      collectedByName: string | null;
      createdAt: Date;
      refundOfPaymentId?: string | null;
      allocations: Array<{ orderItemId: string; amount: number }>;
    }>;
  },
  paidByItem: Map<string, number>,
) {
  const itemSummaries = order.items.map((item) => {
    const lineTotal = orderItemLineTotal(item);
    const paid = paidByItem.get(item.id) ?? 0;
    return {
      id: item.id,
      itemName: item.itemName,
      quantity: item.quantity,
      status: item.status,
      lineTotal,
      paid,
      remaining: Math.max(0, lineTotal - paid),
    };
  });

  let financials: OrderFinancialSummary = financialsForOrder({
    items: order.items,
    discountAmount: order.discountAmount,
    payments: order.payments,
    gstEnabled: order.restaurant?.receiptGstEnabled,
    gstRate: order.restaurant?.receiptGstRate,
  });
  const finalizedBill = order.bills?.find((bill) => bill.status === "FINALIZED");
  if (finalizedBill) {
    const grandTotalPaise = toPaise(finalizedBill.grandTotal);
    const amountDuePaise = maxPaise(0, grandTotalPaise - financials.netPaidPaise);
    const amountDue = fromPaise(amountDuePaise);
    financials = {
      ...financials,
      itemSubtotal: finalizedBill.itemSubtotal,
      orderDiscount: finalizedBill.orderDiscount,
      gstAmount: finalizedBill.gstAmount,
      cgstAmount: finalizedBill.cgstAmount,
      sgstAmount: finalizedBill.sgstAmount,
      grandTotal: finalizedBill.grandTotal,
      amountDue,
      fullyPaid: amountDuePaise <= 0,
      itemSubtotalPaise: toPaise(finalizedBill.itemSubtotal),
      orderDiscountPaise: toPaise(finalizedBill.orderDiscount),
      gstPaise: toPaise(finalizedBill.gstAmount),
      cgstPaise: toPaise(finalizedBill.cgstAmount),
      sgstPaise: toPaise(finalizedBill.sgstAmount),
      grandTotalPaise,
      amountDuePaise,
    };
  }

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    tableId: order.tableId,
    status: order.status,
    paidAt: order.paidAt,
    total: financials.grandTotal,
    paid: financials.netPaid,
    remaining: financials.amountDue,
    discountAmount: financials.orderDiscount,
    gstAmount: financials.gstAmount,
    financials,
    fullyPaid: order.status === "SERVED" && financials.amountDue <= FINANCIAL_PAID_EPSILON,
    items: itemSummaries,
    payments: order.payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      method: p.method,
      status: p.status ?? PAYMENT_STATUS.CAPTURED,
      verificationStatus: p.verificationStatus,
      provider: p.provider ?? null,
      note: p.note,
      collectedByName: p.collectedByName,
      createdAt: p.createdAt,
      itemIds: p.allocations.map((a) => a.orderItemId),
    })),
  };
}

export async function getOrderPaymentSummaries(orderIds: string[]) {
  if (orderIds.length === 0) {
    return new Map<string, ReturnType<typeof computeSummaryFromOrder>>();
  }

  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    include: {
      items: true,
      payments: { include: { allocations: true } },
      restaurant: { select: { receiptGstEnabled: true, receiptGstRate: true } },
      bills: true,
    },
  });

  const summaries = new Map<string, ReturnType<typeof computeSummaryFromOrder>>();
  for (const order of orders) {
    summaries.set(order.id, computeSummaryFromOrder(order, paidByItemFromPayments(order)));
  }
  return summaries;
}

export async function getOrderPaymentSummary(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      payments: { include: { allocations: true } },
      restaurant: { select: { receiptGstEnabled: true, receiptGstRate: true } },
      bills: true,
    },
  });
  if (!order) return null;

  return computeSummaryFromOrder(order, paidByItemFromPayments(order));
}

function paidByItemFromPayments(order: {
  items: Array<{ id: string }>;
  payments: Array<{
    amount: number;
    status?: string | null;
    refundOfPaymentId?: string | null;
    allocations: Array<{ orderItemId: string; amount: number }>;
  }>;
}) {
  const paidByItem = new Map<string, number>();
  for (const item of order.items) {
    paidByItem.set(item.id, 0);
  }
  for (const payment of order.payments) {
    if (!isCapturedPayment(payment)) continue;
    for (const allocation of payment.allocations) {
      paidByItem.set(
        allocation.orderItemId,
        (paidByItem.get(allocation.orderItemId) ?? 0) + allocation.amount,
      );
    }
  }
  return paidByItem;
}

function buildAllocations(
  items: OrderItemRow[],
  itemIds: string[] | undefined,
  amount: number,
  paidByItem: Map<string, number>,
) {
  const targets = items.filter((item) => {
    if (item.status !== "SERVED") return false;
    if (itemIds && itemIds.length > 0 && !itemIds.includes(item.id)) return false;
    const lineTotal = orderItemLineTotal(item);
    const alreadyPaid = paidByItem.get(item.id) ?? 0;
    return lineTotal - alreadyPaid > 0.01;
  });

  if (targets.length === 0) {
    return { ok: false as const, error: "No payable items selected" };
  }

  let remainingPaise = toPaise(amount);
  const allocations: Array<{ orderItemId: string; quantity: number; amount: number }> = [];

  for (const item of targets) {
    if (remainingPaise <= 0) break;
    const lineTotalPaise = toPaise(orderItemLineTotal(item));
    const alreadyPaidPaise = toPaise(paidByItem.get(item.id) ?? 0);
    const itemRemainingPaise = maxPaise(0, lineTotalPaise - alreadyPaidPaise);
    const allocPaise = minPaise(itemRemainingPaise, remainingPaise);
    if (allocPaise <= 0) continue;
    allocations.push({
      orderItemId: item.id,
      quantity: item.quantity,
      amount: fromPaise(allocPaise),
    });
    remainingPaise -= allocPaise;
  }

  if (remainingPaise > 0) {
    if (allocations.length > 0) {
      const last = allocations[allocations.length - 1]!;
      last.amount = fromPaise(toPaise(last.amount) + remainingPaise);
      remainingPaise = 0;
    } else {
      const fallback = items.find((item) => item.status === "SERVED");
      if (fallback) {
        allocations.push({
          orderItemId: fallback.id,
          quantity: fallback.quantity,
          amount: fromPaise(remainingPaise),
        });
        remainingPaise = 0;
      }
    }
  }

  if (allocations.length === 0) {
    return { ok: false as const, error: "Nothing to allocate" };
  }

  const applied = fromPaise(toPaise(amount) - remainingPaise);
  const selectedCap = itemIds?.length
    ? targets.reduce((sum, item) => {
        const lineTotal = orderItemLineTotal(item);
        const alreadyPaid = paidByItem.get(item.id) ?? 0;
        return sum + Math.max(0, lineTotal - alreadyPaid);
      }, 0)
    : null;

  if (selectedCap !== null && amount > selectedCap + 0.01) {
    return {
      ok: false as const,
      error: "Amount exceeds selected items' remaining balance",
    };
  }

  return { ok: true as const, allocations, applied };
}

export async function finalizeOrderIfSettled(
  orderId: string,
  closedBy?: { userId?: string; name?: string },
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, paidAt: true, tableId: true, status: true },
  });
  if (!order || order.paidAt) return false;
  if (order.status !== "SERVED") return false;

  const summary = await getOrderPaymentSummary(orderId);
  if (!summary) return false;

  const shouldClose =
    (summary.total > 0 && summary.paid >= summary.total - 0.01) ||
    summary.total <= 0;

  if (!shouldClose) return false;

  await prisma.order.update({
    where: { id: orderId },
    data: {
      paidAt: new Date(),
      paidByUserId: closedBy?.userId ?? undefined,
      paidByName: closedBy?.name ?? undefined,
    },
  });
  await clearPaymentAlerts(orderId);
  const orderRow = await prisma.order.findUnique({
    where: { id: orderId },
    select: { tableId: true },
  });
  if (orderRow) {
    const { onTabPaymentProgress } = await import("@/lib/payment-service");
    await onTabPaymentProgress(orderRow.tableId);
    const { maybeAutoCloseTableAfterPayment } = await import("@/lib/table-ordering-service");
    await maybeAutoCloseTableAfterPayment(orderRow.tableId);
  }
  return true;
}

export async function recordOrderPayment(params: {
  orderId: string;
  amount: number;
  method?: PaymentMethod;
  note?: string;
  itemIds?: string[];
  collectedByUserId?: string;
  collectedByName?: string;
  status?: string;
  verificationStatus?: string | null;
  cashTendered?: number;
  idempotencyKey?: string;
  provider?: string;
  providerPaymentId?: string;
  capture?: boolean;
}) {
  try {
    const result = await runWithUniqueConstraintRetry(() =>
      prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: params.orderId },
        include: {
          items: true,
          payments: { include: { allocations: true } },
          restaurant: { select: { receiptGstEnabled: true, receiptGstRate: true } },
          bills: true,
        },
      });
      if (!order) {
        return { ok: false as const, error: "Order not found", status: 404 };
      }
      if (order.status !== "SERVED") {
        return {
          ok: false as const,
          error: "Order must be fully served before payment",
          status: 400,
        };
      }

      const idempotencyKey = params.idempotencyKey?.trim() || null;
      if (idempotencyKey) {
        const existing = await tx.payment.findUnique({
          where: {
            restaurantId_idempotencyKey: {
              restaurantId: order.restaurantId,
              idempotencyKey,
            },
          },
          include: { allocations: true },
        });
        if (existing) {
          const summary = computeSummaryFromOrder(order, paidByItemFromPayments(order));
          setForensicCorrelationId(existing.id);
          setForensicResource({ type: "Payment", id: existing.id });
          await appendPlatformAuditEventInTx(tx, {
            category: AUDIT_CATEGORY.MONEY,
            action: AUDIT_ACTION.PAYMENT_CAPTURE_REPLAYED,
            restaurantId: order.restaurantId,
            tenantId: order.tenantId,
            branchId: order.branchId,
            resourceType: "Payment",
            resourceId: existing.id,
            correlationId: existing.id,
            after: auditPaymentSnapshot(existing),
            metadata: { orderId: order.id, billId: existing.billId, providerPaymentId: existing.providerPaymentId },
          });
          return {
            ok: true as const,
            payment: existing,
            summary,
            fullyPaid: summary.fullyPaid,
            tableId: order.tableId,
            orderId: order.id,
            idempotent: true as const,
          };
        }
      }

      const paidByItem = paidByItemFromPayments(order);
      const summary = computeSummaryFromOrder(order, paidByItem);
      const method = params.method ?? "UPI";
      const capture =
        params.capture ??
        !(method === "MANUAL_UPI" && params.status === PAYMENT_STATUS.PENDING);
      const status =
        params.status ??
        (capture ? PAYMENT_STATUS.CAPTURED : PAYMENT_STATUS.PENDING);

      const isGatewayCapture = params.provider === "razorpay" && Boolean(params.providerPaymentId) && capture;
      if (capture && !isGatewayCapture) {
        const { findActiveGatewayAttempt } = await import("@/lib/gateway-attempt-guard");
        const activeGateway = await findActiveGatewayAttempt(order.id);
        if (activeGateway) {
          return {
            ok: false as const,
            error: "Automatic payment is in progress. Cancel or wait before collecting another method.",
            status: 409,
          };
        }
      }

      if (order.paidAt || summary.remaining <= FINANCIAL_PAID_EPSILON) {
        if (!order.paidAt && summary.fullyPaid) {
          await tx.order.update({
            where: { id: order.id },
            data: {
              paidAt: new Date(),
              paidByUserId: params.collectedByUserId ?? null,
              paidByName: params.collectedByName ?? null,
            },
          });
        }
        return {
          ok: true as const,
          payment: null,
          summary,
          fullyPaid: true,
          tableId: order.tableId,
          orderId: order.id,
          idempotent: true as const,
        };
      }

      const amount = fromPaise(minPaise(toPaise(params.amount), toPaise(summary.remaining)));
      if (amount <= 0 || !Number.isFinite(amount)) {
        return { ok: false as const, error: "Invalid payment amount", status: 400 };
      }

      let cashTendered: number | null = null;
      let cashChange: number | null = null;
      if (method === "CASH" && params.cashTendered != null) {
        cashTendered = fromPaise(toPaise(params.cashTendered));
        if (cashTendered + FINANCIAL_PAID_EPSILON < amount) {
          return { ok: false as const, error: "Cash tendered is less than payment amount", status: 400 };
        }
        cashChange = fromPaise(maxPaise(0, toPaise(cashTendered) - toPaise(amount)));
      }

      const built = buildAllocations(order.items, params.itemIds, amount, paidByItem);
      if (!built.ok) {
        return { ok: false as const, error: built.error, status: 400 };
      }

      const billResult = await finalizeOrderBillInTx(tx, {
        orderId: order.id,
        restaurantId: order.restaurantId,
        actorUserId: params.collectedByUserId,
        actorName: params.collectedByName,
      });
      if (!billResult.ok) {
        throw Object.assign(new Error(billResult.error), { billFinalizeFailed: true, status: billResult.status });
      }

      if (status === PAYMENT_STATUS.CAPTURED) {
        await tx.payment.updateMany({
          where: {
            orderId: order.id,
            method: "MANUAL_UPI",
            status: { in: [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.INITIATED] },
          },
          data: {
            status: PAYMENT_STATUS.CANCELLED,
            verificationStatus: MANUAL_UPI_VERIFICATION.REJECTED,
            idempotencyKey: null,
          },
        });
      }

      const payment = await tx.payment.create({
        data: {
          tenantId: order.tenantId,
          restaurantId: order.restaurantId,
          branchId: order.branchId,
          tableId: order.tableId,
          orderId: order.id,
          billId: billResult.bill.id,
          amount: built.applied,
          method,
          status,
          verificationStatus: params.verificationStatus ?? null,
          cashTendered,
          cashChange,
          idempotencyKey,
          provider: params.provider ?? null,
          providerPaymentId: params.providerPaymentId ?? null,
          note: params.note,
          collectedByUserId: params.collectedByUserId,
          collectedByName: params.collectedByName,
          capturedAt: status === PAYMENT_STATUS.CAPTURED ? new Date() : null,
          allocations: {
            create: built.allocations,
          },
        },
        include: { allocations: true },
      });

      const refreshed = await tx.order.findUnique({
        where: { id: order.id },
        include: {
          items: true,
          payments: { include: { allocations: true } },
          restaurant: { select: { receiptGstEnabled: true, receiptGstRate: true } },
          bills: true,
        },
      });
      if (!refreshed) {
        return { ok: false as const, error: "Order not found", status: 404 };
      }

      const updated = computeSummaryFromOrder(refreshed, paidByItemFromPayments(refreshed));

      if (updated.fullyPaid) {
        await tx.order.update({
          where: { id: order.id },
          data: {
            paidAt: new Date(),
            paidByUserId: params.collectedByUserId ?? null,
            paidByName: params.collectedByName ?? null,
          },
        });
      }

      setForensicCorrelationId(payment.id);
      setForensicResource({ type: "Payment", id: payment.id });
      await appendPlatformAuditEventInTx(tx, {
        category: AUDIT_CATEGORY.MONEY,
        action: AUDIT_ACTION.PAYMENT_RECORDED,
        restaurantId: order.restaurantId,
        tenantId: order.tenantId,
        branchId: order.branchId,
        resourceType: "Payment",
        resourceId: payment.id,
        correlationId: payment.id,
        after: auditPaymentSnapshot(payment),
        metadata: {
          amountPaise: Math.round(Number(payment.amount) * 100),
          currency: "INR",
          orderId: order.id,
          billId: payment.billId,
        },
      });
      if (status === PAYMENT_STATUS.CAPTURED) {
        await appendPlatformAuditEventInTx(tx, {
          category: AUDIT_CATEGORY.MONEY,
          action: method === "CASH" ? AUDIT_ACTION.CASH_PAYMENT_CAPTURED : AUDIT_ACTION.PAYMENT_CAPTURED,
          restaurantId: order.restaurantId,
          tenantId: order.tenantId,
          resourceType: "Payment",
          resourceId: payment.id,
          correlationId: payment.id,
          before: { status: PAYMENT_STATUS.PENDING },
          after: auditPaymentSnapshot(payment),
        });
      } else if (method === "MANUAL_UPI") {
        await appendPlatformAuditEventInTx(tx, {
          category: AUDIT_CATEGORY.MONEY,
          action: AUDIT_ACTION.MANUAL_UPI_SUBMITTED,
          restaurantId: order.restaurantId,
          resourceType: "Payment",
          resourceId: payment.id,
          correlationId: payment.id,
          after: auditPaymentSnapshot(payment),
        });
      }

      return {
        ok: true as const,
        payment,
        summary: updated,
        fullyPaid: updated.fullyPaid,
        tableId: order.tableId,
        orderId: order.id,
        billCreated: billResult.created,
      };
    }),
    );

    if (!result.ok) return result;

    if (result.payment?.billId && result.billCreated) {
      const bill = await prisma.bill.findUnique({ where: { id: result.payment.billId } });
      if (bill) {
        await publishBillFinalized({
          bill,
          created: true,
          actorUserId: params.collectedByUserId,
          actorName: params.collectedByName,
        });
      }
    }

    if (result.payment && result.payment.status === PAYMENT_STATUS.CAPTURED) {
      logInfo("payments", "Payment captured", {
        paymentId: result.payment.id,
        orderId: result.orderId,
        restaurantId: result.payment.restaurantId,
        billId: result.payment.billId,
        amount: result.payment.amount,
        method: result.payment.method,
      });
      await recordAuditLog({
        restaurantId: result.payment.restaurantId,
        actionType: "PAYMENT_CAPTURED",
        entityId: result.payment.id,
        payload: {
          orderId: result.orderId,
          amount: result.payment.amount,
          method: result.payment.method,
          cashTendered: result.payment.cashTendered,
          cashChange: result.payment.cashChange,
        },
        actorUserId: params.collectedByUserId,
        actorName: params.collectedByName,
      });
    }

    if (result.fullyPaid) {
      await clearPaymentAlerts(result.orderId);
      const { onTabPaymentProgress } = await import("@/lib/payment-service");
      await onTabPaymentProgress(result.tableId);
      const { maybeAutoCloseTableAfterPayment } = await import("@/lib/table-ordering-service");
      await maybeAutoCloseTableAfterPayment(result.tableId);
    }

    return {
      ok: true as const,
      payment: result.payment,
      summary: result.summary,
      fullyPaid: result.fullyPaid,
    };
  } catch (error) {
    if (error && typeof error === "object" && "billFinalizeFailed" in error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Bill could not be finalized",
        status: 500,
      };
    }
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return { ok: false as const, error: "Duplicate payment request", status: 409 };
    }
    return { ok: false as const, error: "Payment could not be recorded", status: 500 };
  }
}

export async function recordFullOrderPayment(params: {
  orderId: string;
  method?: PaymentMethod;
  collectedByUserId?: string;
  collectedByName?: string;
  cashTendered?: number;
}) {
  const summary = await getOrderPaymentSummary(params.orderId);
  if (!summary) {
    return { ok: false as const, error: "Order not found", status: 404 };
  }
  return recordOrderPayment({
    ...params,
    amount: summary.remaining,
  });
}

export async function recordTableTabFullPayment(params: {
  tableId: string;
  method?: PaymentMethod;
  collectedByUserId?: string;
  collectedByName?: string;
}) {
  const { getTableTabPaymentSummary } = await import("@/lib/table-tab-service");
  const tabSummary = await getTableTabPaymentSummary(params.tableId);
  if (tabSummary.unpaidOrderIds.length === 0) {
    return { ok: false as const, error: "Nothing to pay for this table", status: 400 };
  }

  let lastResult:
    | { ok: true; payment: unknown; summary: unknown; fullyPaid: boolean }
    | { ok: false; error: string; status: number } | null = null;
  const paidOrderIds: string[] = [];

  for (const orderId of tabSummary.unpaidOrderIds) {
    const result = await recordFullOrderPayment({
      orderId,
      method: params.method,
      collectedByUserId: params.collectedByUserId,
      collectedByName: params.collectedByName,
    });
    if (!result.ok) {
      const alreadyPaid =
        result.status === 400 &&
        (result.error === "Order already fully paid" || result.error === "Nothing to pay for this table");
      if (alreadyPaid) {
        paidOrderIds.push(orderId);
        continue;
      }
      return result;
    }
    lastResult = result;
    paidOrderIds.push(orderId);
  }

  if (paidOrderIds.length === 0) {
    return { ok: false as const, error: "Nothing to pay for this table", status: 400 };
  }

  return {
    ok: true as const,
    payment: lastResult?.payment,
    summary: lastResult?.summary,
    fullyPaid: true,
    paidOrderIds,
  };
}

/** Deterministic key for the single active MANUAL_UPI attempt on an order. */
export function manualUpiActiveAttemptKey(orderId: string) {
  return `manual-upi-active:${orderId}`;
}

function isActiveManualUpiStatus(status: string | null | undefined) {
  return status === PAYMENT_STATUS.PENDING || status === PAYMENT_STATUS.INITIATED;
}

export async function initiateManualUpiPayment(params: {
  orderId: string;
  tableId?: string;
  actorUserId?: string;
  actorName?: string;
}) {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    select: { id: true, tableId: true, restaurantId: true },
  });
  if (!order) return { ok: false as const, error: "Order not found", status: 404 };

  const { findActiveGatewayAttempt } = await import("@/lib/gateway-attempt-guard");
  if (await findActiveGatewayAttempt(params.orderId)) {
    return {
      ok: false as const,
      error: "Automatic payment is in progress. Please don't start a second payment.",
      status: 409,
    };
  }

  const { getTableTabPaymentSummary } = await import("@/lib/table-tab-service");
  const tab = await getTableTabPaymentSummary(params.tableId ?? order.tableId);
  if (tab.unpaidOrderIds.length > 1) {
    return {
      ok: false as const,
      error: "Ask staff to confirm this table bill. Multi-order UPI cannot be recorded against one order.",
      status: 409,
    };
  }

  const activeKey = manualUpiActiveAttemptKey(params.orderId);
  const active = await prisma.payment.findFirst({
    where: {
      orderId: params.orderId,
      method: "MANUAL_UPI",
      status: { in: [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.INITIATED] },
    },
    include: { allocations: true },
  });
  if (active) {
    const summary = await getOrderPaymentSummary(params.orderId);
    return {
      ok: true as const,
      payment: active,
      summary,
      fullyPaid: Boolean(summary?.fullyPaid),
      idempotent: true as const,
    };
  }

  const summary = await getOrderPaymentSummary(params.orderId);
  if (!summary || summary.remaining <= FINANCIAL_PAID_EPSILON) {
    return { ok: false as const, error: "Nothing to pay", status: 400 };
  }

  const created = await recordOrderPayment({
    orderId: params.orderId,
    amount: summary.remaining,
    method: "MANUAL_UPI",
    status: PAYMENT_STATUS.PENDING,
    verificationStatus: MANUAL_UPI_VERIFICATION.PENDING_VERIFICATION,
    capture: false,
    note: "Customer opened UPI — awaiting staff verification",
    idempotencyKey: activeKey,
    collectedByUserId: params.actorUserId,
    collectedByName: params.actorName,
  });

  if (created.ok && created.payment && isActiveManualUpiStatus(created.payment.status)) {
    return created;
  }

  const raced = await prisma.payment.findFirst({
    where: {
      restaurantId: order.restaurantId,
      orderId: params.orderId,
      method: "MANUAL_UPI",
      status: { in: [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.INITIATED] },
    },
    include: { allocations: true },
  });
  if (raced) {
    const racedSummary = await getOrderPaymentSummary(params.orderId);
    return {
      ok: true as const,
      payment: raced,
      summary: racedSummary,
      fullyPaid: Boolean(racedSummary?.fullyPaid),
      idempotent: true as const,
    };
  }

  if (created.ok && !created.payment) {
    return created;
  }
  return created.ok
    ? { ok: false as const, error: "Could not start a unique UPI attempt", status: 409 }
    : created;
}

export async function confirmManualUpiPayment(params: {
  paymentId: string;
  restaurantId: string;
  actorUserId?: string;
  actorName?: string;
}) {
  try {
    const result = await runWithUniqueConstraintRetry(() =>
      prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { id: params.paymentId, restaurantId: params.restaurantId },
      });
      if (!payment) return { ok: false as const, error: "Payment not found", status: 404 };
      if (payment.method !== "MANUAL_UPI") {
        return { ok: false as const, error: "Not a manual UPI payment", status: 400 };
      }
      if (payment.status === PAYMENT_STATUS.CAPTURED) {
        await appendPlatformAuditEventInTx(tx, {
          category: AUDIT_CATEGORY.MONEY,
          action: AUDIT_ACTION.PAYMENT_CAPTURE_REPLAYED,
          restaurantId: payment.restaurantId,
          resourceType: "Payment",
          resourceId: payment.id,
          correlationId: payment.id,
          after: auditPaymentSnapshot(payment),
        });
        return {
          ok: true as const,
          payment,
          alreadyCaptured: true,
          billCreated: false,
          fullyPaid: Boolean(payment.orderId),
          tableId: payment.tableId,
          orderId: payment.orderId,
        };
      }
      if (payment.status !== PAYMENT_STATUS.PENDING && payment.status !== PAYMENT_STATUS.INITIATED) {
        return { ok: false as const, error: "Payment cannot be confirmed", status: 409 };
      }
      if (!payment.orderId) {
        return { ok: false as const, error: "Payment is not linked to an order", status: 409 };
      }

      const order = await tx.order.findUnique({
        where: { id: payment.orderId },
        include: {
          items: true,
          payments: { include: { allocations: true } },
          restaurant: { select: { receiptGstEnabled: true, receiptGstRate: true } },
          bills: true,
        },
      });
      if (!order || order.restaurantId !== params.restaurantId) {
        return { ok: false as const, error: "Order not found", status: 404 };
      }

      const summary = computeSummaryFromOrder(order, paidByItemFromPayments(order));
      if (toPaise(payment.amount) > toPaise(summary.remaining)) {
        return {
          ok: false as const,
          error: "Amount is no longer due",
          status: 409,
        };
      }

      const billResult = await finalizeOrderBillInTx(tx, {
        orderId: order.id,
        restaurantId: order.restaurantId,
        actorUserId: params.actorUserId,
        actorName: params.actorName,
      });
      if (!billResult.ok) {
        throw Object.assign(new Error(billResult.error), { billFinalizeFailed: true });
      }

      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PAYMENT_STATUS.CAPTURED,
          verificationStatus: MANUAL_UPI_VERIFICATION.CONFIRMED,
          capturedAt: new Date(),
          billId: payment.billId ?? billResult.bill.id,
          collectedByUserId: params.actorUserId ?? payment.collectedByUserId,
          collectedByName: params.actorName ?? payment.collectedByName,
          idempotencyKey: null,
        },
      });

      await tx.payment.updateMany({
        where: {
          orderId: order.id,
          id: { not: payment.id },
          method: "MANUAL_UPI",
          status: { in: [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.INITIATED] },
        },
        data: {
          status: PAYMENT_STATUS.CANCELLED,
          verificationStatus: MANUAL_UPI_VERIFICATION.REJECTED,
          idempotencyKey: null,
        },
      });

      const refreshed = await tx.order.findUnique({
        where: { id: order.id },
        include: {
          items: true,
          payments: { include: { allocations: true } },
          restaurant: { select: { receiptGstEnabled: true, receiptGstRate: true } },
          bills: true,
        },
      });
      const after = refreshed
        ? computeSummaryFromOrder(refreshed, paidByItemFromPayments(refreshed))
        : summary;
      if (after.fullyPaid) {
        await tx.order.update({
          where: { id: order.id },
          data: {
            paidAt: new Date(),
            paidByUserId: params.actorUserId ?? null,
            paidByName: params.actorName ?? null,
          },
        });
      }

      await appendPlatformAuditEventInTx(tx, {
        category: AUDIT_CATEGORY.MONEY,
        action: AUDIT_ACTION.MANUAL_UPI_VERIFIED,
        restaurantId: order.restaurantId,
        resourceType: "Payment",
        resourceId: updated.id,
        correlationId: updated.id,
        before: auditPaymentSnapshot(payment),
        after: auditPaymentSnapshot(updated),
      });
      await appendPlatformAuditEventInTx(tx, {
        category: AUDIT_CATEGORY.MONEY,
        action: AUDIT_ACTION.PAYMENT_CAPTURED,
        restaurantId: order.restaurantId,
        resourceType: "Payment",
        resourceId: updated.id,
        correlationId: updated.id,
        before: { status: payment.status },
        after: auditPaymentSnapshot(updated),
      });

      return {
        ok: true as const,
        payment: updated,
        alreadyCaptured: false as const,
        billCreated: billResult.created,
        fullyPaid: after.fullyPaid,
        tableId: order.tableId,
        orderId: order.id,
      };
    }),
    );

    if (!result.ok) return result;

    if (result.payment.billId && result.billCreated) {
      const bill = await prisma.bill.findUnique({ where: { id: result.payment.billId } });
      if (bill) {
        await publishBillFinalized({
          bill,
          created: true,
          actorUserId: params.actorUserId,
          actorName: params.actorName,
        });
      }
    }

    if (!result.alreadyCaptured) {
      logInfo("payments", "Manual UPI confirmed", {
        paymentId: result.payment.id,
        orderId: result.payment.orderId,
        restaurantId: result.payment.restaurantId,
        billId: result.payment.billId,
      });
      await recordAuditLog({
        restaurantId: result.payment.restaurantId,
        actionType: "PAYMENT_CAPTURED",
        entityId: result.payment.id,
        payload: { method: "MANUAL_UPI", amount: result.payment.amount, orderId: result.payment.orderId },
        actorUserId: params.actorUserId,
        actorName: params.actorName,
      });
    }

    if (result.fullyPaid && result.orderId && result.tableId) {
      await clearPaymentAlerts(result.orderId);
      const { onTabPaymentProgress } = await import("@/lib/payment-service");
      await onTabPaymentProgress(result.tableId);
      const { maybeAutoCloseTableAfterPayment } = await import("@/lib/table-ordering-service");
      await maybeAutoCloseTableAfterPayment(result.tableId);
    }

    const summary = result.orderId ? await getOrderPaymentSummary(result.orderId) : null;
    return {
      ok: true as const,
      payment: result.payment,
      summary,
      fullyPaid: Boolean(summary?.fullyPaid ?? result.fullyPaid),
    };
  } catch (error) {
    if (error && typeof error === "object" && "billFinalizeFailed" in error) {
      return { ok: false as const, error: "Bill could not be finalized", status: 500 };
    }
    return { ok: false as const, error: "Payment could not be confirmed", status: 500 };
  }
}

export async function rejectManualUpiPayment(params: {
  paymentId: string;
  restaurantId: string;
  actorUserId?: string;
  actorName?: string;
}) {
  const payment = await prisma.payment.findFirst({
    where: { id: params.paymentId, restaurantId: params.restaurantId },
  });
  if (!payment) return { ok: false as const, error: "Payment not found", status: 404 };
  if (payment.status === PAYMENT_STATUS.CAPTURED) {
    return { ok: false as const, error: "Captured payment cannot be rejected", status: 409 };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: PAYMENT_STATUS.FAILED,
        verificationStatus: MANUAL_UPI_VERIFICATION.REJECTED,
        idempotencyKey: null,
      },
    });
    await appendPlatformAuditEventInTx(tx, {
      category: AUDIT_CATEGORY.MONEY,
      action: AUDIT_ACTION.MANUAL_UPI_REJECTED,
      restaurantId: payment.restaurantId,
      resourceType: "Payment",
      resourceId: next.id,
      correlationId: next.id,
      before: auditPaymentSnapshot(payment),
      after: auditPaymentSnapshot(next),
    });
    return next;
  });
  return { ok: true as const, payment: updated };
}

export async function refundCapturedPayment(params: {
  paymentId: string;
  restaurantId: string;
  amount?: number;
  actorUserId?: string;
  actorName?: string;
  idempotencyKey?: string;
  provider?: string;
  providerPaymentId?: string;
}) {
  try {
    const result = await runWithUniqueConstraintRetry(() =>
      prisma.$transaction(async (tx) => {
        const original = await tx.payment.findFirst({
          where: { id: params.paymentId, restaurantId: params.restaurantId },
        });
        if (!original) return { ok: false as const, error: "Payment not found", status: 404 };
        if (!isCapturedPayment(original)) {
          return { ok: false as const, error: "Only captured payments can be refunded", status: 400 };
        }

        const idempotencyKey = params.idempotencyKey?.trim() || null;
        if (idempotencyKey) {
          const existing = await tx.payment.findUnique({
            where: {
              restaurantId_idempotencyKey: {
                restaurantId: params.restaurantId,
                idempotencyKey,
              },
            },
          });
          if (existing?.refundOfPaymentId === original.id) {
            await appendPlatformAuditEventInTx(tx, {
              category: AUDIT_CATEGORY.MONEY,
              action: AUDIT_ACTION.PAYMENT_CAPTURE_REPLAYED,
              restaurantId: params.restaurantId,
              resourceType: "Payment",
              resourceId: existing.id,
              correlationId: original.id,
              metadata: { replay: "refund" },
            });
            return { ok: true as const, payment: existing, idempotent: true as const };
          }
          if (existing) {
            return { ok: false as const, error: "Idempotency key already used", status: 409 };
          }
        }

        const priorRefunds = await tx.payment.findMany({
          where: { restaurantId: params.restaurantId, refundOfPaymentId: original.id },
        });
        const alreadyRefundedPaise = priorRefunds.reduce((sum, row) => sum + toPaise(row.amount), 0);
        const refundAmount = params.amount == null ? original.amount : params.amount;
        const refundPaise = toPaise(refundAmount);
        if (refundPaise <= 0) {
          return { ok: false as const, error: "Invalid refund amount", status: 400 };
        }
        if (alreadyRefundedPaise + refundPaise > toPaise(original.amount)) {
          return { ok: false as const, error: "Refund exceeds captured amount", status: 400 };
        }

        const refund = await tx.payment.create({
          data: {
            tenantId: original.tenantId,
            restaurantId: original.restaurantId,
            branchId: original.branchId,
            tableId: original.tableId,
            orderId: original.orderId,
            billId: original.billId,
            amount: fromPaise(refundPaise),
            method: original.method,
            status: PAYMENT_STATUS.REFUNDED,
            refundOfPaymentId: original.id,
            provider: params.provider ?? original.provider,
            providerPaymentId: params.providerPaymentId ?? null,
            idempotencyKey: idempotencyKey ?? `refund:${original.id}:${crypto.randomUUID()}`,
            note: `Refund of ${original.id}`,
            collectedByUserId: params.actorUserId,
            collectedByName: params.actorName,
          },
        });

        if (original.orderId) {
          await tx.order.update({
            where: { id: original.orderId },
            data: { paidAt: null, paidByUserId: null, paidByName: null },
          });
        }

        await appendPlatformAuditEventInTx(tx, {
          category: AUDIT_CATEGORY.MONEY,
          action: AUDIT_ACTION.REFUND_REQUESTED,
          restaurantId: original.restaurantId,
          tenantId: original.tenantId,
          resourceType: "Payment",
          resourceId: refund.id,
          correlationId: original.id,
          before: {
            capturedPaise: Math.round(Number(original.amount) * 100),
            refundedPaise: alreadyRefundedPaise,
          },
          after: {
            capturedPaise: Math.round(Number(original.amount) * 100),
            refundedPaise: alreadyRefundedPaise + refundPaise,
          },
          metadata: {
            paymentId: original.id,
            refundId: refund.id,
            amountPaise: refundPaise,
            currency: "INR",
            provider: refund.provider,
            providerPaymentId: refund.providerPaymentId,
            billId: original.billId,
            orderId: original.orderId,
          },
        });
        await appendPlatformAuditEventInTx(tx, {
          category: AUDIT_CATEGORY.MONEY,
          action: AUDIT_ACTION.REFUND_COMPLETED,
          restaurantId: original.restaurantId,
          resourceType: "Payment",
          resourceId: refund.id,
          correlationId: original.id,
          after: auditPaymentSnapshot(refund),
        });
        return { ok: true as const, payment: refund, idempotent: false as const, original };
      }),
    );

    if (!result.ok) return result;
    if (result.idempotent) return { ok: true as const, payment: result.payment, idempotent: true as const };

    logInfo("payments", "Refund recorded", {
      paymentId: result.payment.id,
      refundOfPaymentId: result.original.id,
      restaurantId: result.original.restaurantId,
      orderId: result.original.orderId,
      billId: result.original.billId,
      amount: result.payment.amount,
    });

    await recordAuditLog({
      restaurantId: result.original.restaurantId,
      actionType: "PAYMENT_REFUNDED",
      entityId: result.payment.id,
      payload: { refundOfPaymentId: result.original.id, amount: result.payment.amount },
      actorUserId: params.actorUserId,
      actorName: params.actorName,
    });

    return { ok: true as const, payment: result.payment, idempotent: false as const };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return { ok: false as const, error: "Duplicate refund request", status: 409 };
    }
    return { ok: false as const, error: "Refund could not be recorded", status: 500 };
  }
}

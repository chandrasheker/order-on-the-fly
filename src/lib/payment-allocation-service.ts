import { prisma } from "@/lib/prisma";
import type { PaymentMethod } from "@/generated/prisma/client";
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
import { finalizeOrderBill } from "@/lib/bill-service";
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
    const result = await prisma.$transaction(async (tx) => {
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

      const payment = await tx.payment.create({
        data: {
          tenantId: order.tenantId,
          restaurantId: order.restaurantId,
          branchId: order.branchId,
          tableId: order.tableId,
          orderId: order.id,
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

      return {
        ok: true as const,
        payment,
        summary: updated,
        fullyPaid: updated.fullyPaid,
        tableId: order.tableId,
        orderId: order.id,
      };
    });

    if (!result.ok) return result;

    const orderRow = await prisma.order.findUnique({
      where: { id: result.orderId },
      select: { restaurantId: true },
    });
    const billResult = orderRow
      ? await finalizeOrderBill({
          orderId: result.orderId,
          restaurantId: orderRow.restaurantId,
          actorUserId: params.collectedByUserId,
          actorName: params.collectedByName,
        })
      : { ok: false as const };
    if (billResult.ok && result.payment) {
      await prisma.payment.update({
        where: { id: result.payment.id },
        data: { billId: billResult.bill.id },
      });
    }

    if (result.payment && result.payment.status === PAYMENT_STATUS.CAPTURED) {
      logInfo("payments", "Payment captured", {
        paymentId: result.payment.id,
        orderId: result.orderId,
        restaurantId: result.payment.restaurantId,
        billId: billResult.ok ? billResult.bill.id : null,
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

export async function confirmManualUpiPayment(params: {
  paymentId: string;
  restaurantId: string;
  actorUserId?: string;
  actorName?: string;
}) {
  const payment = await prisma.payment.findFirst({
    where: { id: params.paymentId, restaurantId: params.restaurantId },
  });
  if (!payment) return { ok: false as const, error: "Payment not found", status: 404 };
  if (payment.method !== "MANUAL_UPI") {
    return { ok: false as const, error: "Not a manual UPI payment", status: 400 };
  }
  if (payment.status === PAYMENT_STATUS.CAPTURED) {
    const summary = payment.orderId ? await getOrderPaymentSummary(payment.orderId) : null;
    return { ok: true as const, payment, summary, fullyPaid: Boolean(summary?.fullyPaid) };
  }
  if (payment.status !== PAYMENT_STATUS.PENDING && payment.status !== PAYMENT_STATUS.INITIATED) {
    return { ok: false as const, error: "Payment cannot be confirmed", status: 409 };
  }

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: PAYMENT_STATUS.CAPTURED,
      verificationStatus: MANUAL_UPI_VERIFICATION.CONFIRMED,
      capturedAt: new Date(),
      collectedByUserId: params.actorUserId ?? payment.collectedByUserId,
      collectedByName: params.actorName ?? payment.collectedByName,
    },
  });

  logInfo("payments", "Manual UPI confirmed", {
    paymentId: updated.id,
    orderId: updated.orderId,
    restaurantId: updated.restaurantId,
    billId: updated.billId,
  });

  await recordAuditLog({
    restaurantId: updated.restaurantId,
    actionType: "PAYMENT_CAPTURED",
    entityId: updated.id,
    payload: { method: "MANUAL_UPI", amount: updated.amount, orderId: updated.orderId },
    actorUserId: params.actorUserId,
    actorName: params.actorName,
  });

  if (updated.orderId) {
    await finalizeOrderBill({
      orderId: updated.orderId,
      restaurantId: updated.restaurantId,
      actorUserId: params.actorUserId,
      actorName: params.actorName,
    });
    await finalizeOrderIfSettled(updated.orderId, {
      userId: params.actorUserId,
      name: params.actorName,
    });
    const summary = await getOrderPaymentSummary(updated.orderId);
    return { ok: true as const, payment: updated, summary, fullyPaid: Boolean(summary?.fullyPaid) };
  }
  return { ok: true as const, payment: updated, summary: null, fullyPaid: false };
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

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: PAYMENT_STATUS.FAILED,
      verificationStatus: MANUAL_UPI_VERIFICATION.REJECTED,
    },
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
}) {
  const original = await prisma.payment.findFirst({
    where: { id: params.paymentId, restaurantId: params.restaurantId },
  });
  if (!original) return { ok: false as const, error: "Payment not found", status: 404 };
  if (!isCapturedPayment(original)) {
    return { ok: false as const, error: "Only captured payments can be refunded", status: 400 };
  }

  const already = await prisma.payment.findFirst({
    where: { restaurantId: params.restaurantId, refundOfPaymentId: original.id },
  });
  if (already) return { ok: true as const, payment: already, idempotent: true };

  const refundAmount = params.amount == null ? original.amount : params.amount;
  if (toPaise(refundAmount) <= 0 || toPaise(refundAmount) > toPaise(original.amount)) {
    return { ok: false as const, error: "Invalid refund amount", status: 400 };
  }

  const refund = await prisma.payment.create({
    data: {
      tenantId: original.tenantId,
      restaurantId: original.restaurantId,
      branchId: original.branchId,
      tableId: original.tableId,
      orderId: original.orderId,
      billId: original.billId,
      amount: fromPaise(toPaise(refundAmount)),
      method: original.method,
      status: PAYMENT_STATUS.REFUNDED,
      refundOfPaymentId: original.id,
      idempotencyKey: params.idempotencyKey ?? `refund:${original.id}`,
      note: `Refund of ${original.id}`,
      collectedByUserId: params.actorUserId,
      collectedByName: params.actorName,
    },
  });

  if (original.orderId) {
    await prisma.order.update({
      where: { id: original.orderId },
      data: { paidAt: null, paidByUserId: null, paidByName: null },
    });
  }

  logInfo("payments", "Refund recorded", {
    paymentId: refund.id,
    refundOfPaymentId: original.id,
    restaurantId: original.restaurantId,
    orderId: original.orderId,
    billId: original.billId,
    amount: refund.amount,
  });

  await recordAuditLog({
    restaurantId: original.restaurantId,
    actionType: "PAYMENT_REFUNDED",
    entityId: refund.id,
    payload: { refundOfPaymentId: original.id, amount: refund.amount },
    actorUserId: params.actorUserId,
    actorName: params.actorName,
  });

  return { ok: true as const, payment: refund, idempotent: false };
}

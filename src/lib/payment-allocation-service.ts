import { prisma } from "@/lib/prisma";
import type { PaymentMethod } from "@/generated/prisma/client";
import { clearPaymentAlerts } from "@/lib/payment-service";
import { orderItemLineTotal, sumOrderRevenue } from "@/lib/utils";

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
    payments: Array<{
      id: string;
      amount: number;
      method: PaymentMethod;
      note: string | null;
      collectedByName: string | null;
      createdAt: Date;
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

  const total = sumOrderRevenue(order.items);
  const paid = order.payments.reduce((sum, payment) => sum + payment.amount, 0);

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    tableId: order.tableId,
    status: order.status,
    paidAt: order.paidAt,
    total,
    paid,
    remaining: Math.max(0, total - paid),
    fullyPaid: (total <= 0 && paid === 0) || (total > 0 && paid >= total - 0.01),
    items: itemSummaries,
    payments: order.payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      method: p.method,
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
    },
  });

  const summaries = new Map<string, ReturnType<typeof computeSummaryFromOrder>>();
  for (const order of orders) {
    const paidByItem = new Map<string, number>();
    for (const item of order.items) {
      paidByItem.set(item.id, 0);
    }
    for (const payment of order.payments) {
      for (const allocation of payment.allocations) {
        paidByItem.set(
          allocation.orderItemId,
          (paidByItem.get(allocation.orderItemId) ?? 0) + allocation.amount,
        );
      }
    }
    summaries.set(order.id, computeSummaryFromOrder(order, paidByItem));
  }
  return summaries;
}

export async function getOrderPaymentSummary(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      payments: { include: { allocations: true } },
    },
  });
  if (!order) return null;

  const paidByItem = new Map<string, number>();
  for (const item of order.items) {
    paidByItem.set(item.id, 0);
  }
  for (const payment of order.payments) {
    for (const allocation of payment.allocations) {
      paidByItem.set(
        allocation.orderItemId,
        (paidByItem.get(allocation.orderItemId) ?? 0) + allocation.amount,
      );
    }
  }

  return computeSummaryFromOrder(order, paidByItem);
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

  let remaining = amount;
  const allocations: Array<{ orderItemId: string; quantity: number; amount: number }> = [];

  for (const item of targets) {
    if (remaining <= 0.01) break;
    const lineTotal = orderItemLineTotal(item);
    const alreadyPaid = paidByItem.get(item.id) ?? 0;
    const itemRemaining = Math.max(0, lineTotal - alreadyPaid);
    const allocAmount = Math.min(itemRemaining, remaining);
    if (allocAmount <= 0) continue;
    allocations.push({
      orderItemId: item.id,
      quantity: item.quantity,
      amount: allocAmount,
    });
    remaining -= allocAmount;
  }

  if (allocations.length === 0) {
    return { ok: false as const, error: "Nothing to allocate" };
  }

  const applied = amount - remaining;
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

  const summary = await getOrderPaymentSummary(orderId);
  if (!summary) return false;

  const shouldClose =
    summary.fullyPaid ||
    (summary.total <= 0 && order.status === "SERVED");

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
}) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: params.orderId },
        include: {
          items: true,
          payments: { include: { allocations: true } },
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
      if (order.paidAt) {
        return { ok: false as const, error: "Order already fully paid", status: 400 };
      }

      const paidByItem = new Map<string, number>();
      for (const item of order.items) {
        paidByItem.set(item.id, 0);
      }
      for (const payment of order.payments) {
        for (const allocation of payment.allocations) {
          paidByItem.set(
            allocation.orderItemId,
            (paidByItem.get(allocation.orderItemId) ?? 0) + allocation.amount,
          );
        }
      }

      const summary = computeSummaryFromOrder(order, paidByItem);
      if (summary.remaining <= 0) {
        return { ok: false as const, error: "Order already fully paid", status: 400 };
      }

      const amount = Math.min(params.amount, summary.remaining);
      if (amount <= 0 || !Number.isFinite(amount)) {
        return { ok: false as const, error: "Invalid payment amount", status: 400 };
      }

      const built = buildAllocations(order.items, params.itemIds, amount, paidByItem);
      if (!built.ok) {
        return { ok: false as const, error: built.error, status: 400 };
      }

      const payment = await tx.payment.create({
        data: {
          restaurantId: order.restaurantId,
          tableId: order.tableId,
          orderId: order.id,
          amount: built.applied,
          method: params.method ?? "UPI",
          note: params.note,
          collectedByUserId: params.collectedByUserId,
          collectedByName: params.collectedByName,
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
        },
      });
      if (!refreshed) {
        return { ok: false as const, error: "Order not found", status: 404 };
      }

      const paidByItemAfter = new Map<string, number>();
      for (const item of refreshed.items) paidByItemAfter.set(item.id, 0);
      for (const p of refreshed.payments) {
        for (const a of p.allocations) {
          paidByItemAfter.set(
            a.orderItemId,
            (paidByItemAfter.get(a.orderItemId) ?? 0) + a.amount,
          );
        }
      }
      const updated = computeSummaryFromOrder(refreshed, paidByItemAfter);

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
  } catch {
    return { ok: false as const, error: "Payment could not be recorded", status: 500 };
  }
}

export async function recordFullOrderPayment(params: {
  orderId: string;
  method?: PaymentMethod;
  collectedByUserId?: string;
  collectedByName?: string;
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

  for (const orderId of tabSummary.unpaidOrderIds) {
    const result = await recordFullOrderPayment({
      orderId,
      method: params.method,
      collectedByUserId: params.collectedByUserId,
      collectedByName: params.collectedByName,
    });
    if (!result.ok) return result;
    lastResult = result;
  }

  return {
    ok: true as const,
    payment: lastResult?.payment,
    summary: lastResult?.summary,
    fullyPaid: true,
    paidOrderIds: tabSummary.unpaidOrderIds,
  };
}

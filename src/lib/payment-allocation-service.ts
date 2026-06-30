import { prisma } from "@/lib/prisma";
import type { PaymentMethod } from "@/generated/prisma/client";
import { clearPaymentAlerts } from "@/lib/payment-service";
import { maybeAutoCloseTableAfterPayment } from "@/lib/table-ordering-service";
import { orderItemLineTotal, sumOrderRevenue } from "@/lib/utils";

type OrderItemRow = {
  id: string;
  quantity: number;
  unitPrice: number;
  status: string;
};

export async function getItemPaidAmount(orderItemId: string) {
  const allocations = await prisma.paymentAllocation.aggregate({
    where: { orderItemId },
    _sum: { amount: true },
  });
  return allocations._sum.amount ?? 0;
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

  const itemSummaries = await Promise.all(
    order.items.map(async (item) => {
      const lineTotal = orderItemLineTotal(item);
      const paid = await getItemPaidAmount(item.id);
      return {
        id: item.id,
        itemName: item.itemName,
        quantity: item.quantity,
        status: item.status,
        lineTotal,
        paid,
        remaining: Math.max(0, lineTotal - paid),
      };
    }),
  );

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
    fullyPaid: total > 0 && paid >= total - 0.01,
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

  return { ok: true as const, allocations, applied: amount - remaining };
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
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: { items: true, payments: { include: { allocations: true } } },
  });
  if (!order) {
    return { ok: false as const, error: "Order not found", status: 404 };
  }
  if (order.status !== "SERVED") {
    return { ok: false as const, error: "Order must be fully served before payment", status: 400 };
  }

  const summary = await getOrderPaymentSummary(order.id);
  if (!summary) {
    return { ok: false as const, error: "Order not found", status: 404 };
  }
  if (summary.remaining <= 0) {
    return { ok: false as const, error: "Order already fully paid", status: 400 };
  }

  const amount = Math.min(params.amount, summary.remaining);
  if (amount <= 0) {
    return { ok: false as const, error: "Invalid payment amount", status: 400 };
  }

  const paidByItem = new Map<string, number>();
  for (const item of summary.items) {
    paidByItem.set(item.id, item.paid);
  }

  const built = buildAllocations(order.items, params.itemIds, amount, paidByItem);
  if (!built.ok) {
    return { ok: false as const, error: built.error, status: 400 };
  }

  const payment = await prisma.payment.create({
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

  const updated = await getOrderPaymentSummary(order.id);
  if (updated?.fullyPaid) {
    await prisma.order.update({
      where: { id: order.id },
      data: { paidAt: new Date() },
    });
    await clearPaymentAlerts(order.id);
    await maybeAutoCloseTableAfterPayment(order.tableId);
  }

  return {
    ok: true as const,
    payment,
    summary: updated,
    fullyPaid: updated?.fullyPaid ?? false,
  };
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

import { prisma } from "@/lib/prisma";
import { todayDateString, formatCurrency } from "@/lib/utils";
import { paymentQrExists } from "@/lib/payment-qr-storage";
import { getOrderPaymentSummary } from "@/lib/payment-allocation-service";

export async function isTablePaymentBlocked(tableId: string) {
  const orders = await prisma.order.findMany({
    where: {
      tableId,
      date: todayDateString(),
      paymentRequestedAt: { not: null },
      paidAt: null,
    },
    select: { id: true },
  });
  for (const order of orders) {
    const summary = await getOrderPaymentSummary(order.id);
    if (summary && summary.remaining > 0) return true;
  }
  return false;
}

export async function clearPaymentAlerts(orderId: string) {
  await prisma.alert.updateMany({
    where: { orderId, type: "PAYMENT", isRead: false },
    data: { isRead: true },
  });
}

export async function requestOrderPayment(orderId: string, tableToken: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, table: true, restaurant: true },
  });

  if (!order) {
    return { ok: false as const, error: "Order not found", status: 404 };
  }

  if (order.table.qrToken !== tableToken) {
    return { ok: false as const, error: "Order not found", status: 404 };
  }

  if (order.status !== "SERVED") {
    return { ok: false as const, error: "Order must be fully served before payment", status: 400 };
  }

  if (order.paidAt) {
    return { ok: false as const, error: "Order already paid", status: 400 };
  }

  const billTotal = (await getOrderPaymentSummary(orderId))?.remaining ?? 0;
  if (billTotal <= 0) {
    return { ok: false as const, error: "Nothing to pay for this order", status: 400 };
  }

  const paymentRequestedAt = order.paymentRequestedAt ?? new Date();

  await prisma.order.update({
    where: { id: orderId },
    data: { paymentRequestedAt },
  });

  const existing = await prisma.alert.findFirst({
    where: { orderId, type: "PAYMENT", isRead: false },
  });

  if (!existing) {
    const hasQr = await paymentQrExists(order.restaurantId);
    await prisma.alert.create({
      data: {
        type: "PAYMENT",
        message: hasQr
          ? `Table ${order.table.number} completed PhonePe payment for Order #${order.orderNumber} — ${formatCurrency(billTotal)} (verify & mark paid)`
          : `Table ${order.table.number} needs to pay Order #${order.orderNumber} — ${formatCurrency(billTotal)} (collect cash/UPI offline)`,
        orderId,
        tableNumber: order.table.number,
        restaurantId: order.restaurantId,
      },
    });
  }

  return {
    ok: true as const,
    paymentRequestedAt,
    billTotal,
    hasPaymentQr: await paymentQrExists(order.restaurantId),
  };
}

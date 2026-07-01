import { prisma } from "@/lib/prisma";
import { todayDateString, formatCurrency } from "@/lib/utils";
import { paymentQrExists } from "@/lib/payment-qr-storage";
import { clearTabPaymentRequestIfSettled, clearTableTabFlags, getTableTabOrders, getTableTabPaymentSummary, isTabFullySettled } from "@/lib/table-tab-service";

/** Tab has a payment request outstanding (informational — does not block new orders). */
export async function isTablePaymentBlocked(tableId: string) {
  const summary = await getTableTabPaymentSummary(tableId);
  return summary.paymentRequested && summary.remaining > 0.01;
}

export async function hasTabPaymentPending(tableId: string) {
  return isTablePaymentBlocked(tableId);
}

export async function clearPaymentAlerts(orderId: string) {
  await prisma.alert.updateMany({
    where: { orderId, type: "PAYMENT", isRead: false },
    data: { isRead: true },
  });
}

export async function clearTablePaymentAlerts(tableId: string) {
  const table = await prisma.table.findUnique({
    where: { id: tableId },
    select: { number: true, restaurantId: true },
  });
  if (!table) return;
  await prisma.alert.updateMany({
    where: {
      restaurantId: table.restaurantId,
      tableNumber: table.number,
      type: "PAYMENT",
      isRead: false,
    },
    data: { isRead: true },
  });
}

export async function requestOrderPayment(orderId: string, tableToken: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { table: true, restaurant: true },
  });

  if (!order) {
    return { ok: false as const, error: "Order not found", status: 404 };
  }

  if (order.table.qrToken !== tableToken) {
    return { ok: false as const, error: "Order not found", status: 404 };
  }

  return requestTableTabPayment(order.tableId, tableToken);
}

export async function requestTableTabPayment(tableId: string, tableToken: string) {
  const table = await prisma.table.findUnique({
    where: { id: tableId },
    include: { restaurant: true },
  });

  if (!table || table.qrToken !== tableToken) {
    return { ok: false as const, error: "Table not found", status: 404 };
  }

  const tabSummary = await getTableTabPaymentSummary(tableId);
  if (tabSummary.remaining <= 0.01) {
    return { ok: false as const, error: "Nothing to pay for this table", status: 400 };
  }

  const tabOrders = await getTableTabOrders(tableId);
  const unpaidServed = tabOrders.filter(
    (o) => o.status === "SERVED" && tabSummary.unpaidOrderIds.includes(o.id),
  );

  if (unpaidServed.length === 0) {
    return {
      ok: false as const,
      error: "All served items must be ready before payment",
      status: 400,
    };
  }

  const paymentRequestedAt = table.tabPaymentRequestedAt ?? new Date();
  const openKitchen = tabOrders.some((o) => o.status !== "SERVED" && o.status !== "CANCELLED");

  await prisma.table.update({
    where: { id: tableId },
    data: { tabPaymentRequestedAt: paymentRequestedAt },
  });

  await prisma.order.updateMany({
    where: { id: { in: tabSummary.unpaidOrderIds } },
    data: { paymentRequestedAt },
  });

  const existing = await prisma.alert.findFirst({
    where: {
      restaurantId: table.restaurantId,
      tableNumber: table.number,
      type: "PAYMENT",
      isRead: false,
    },
  });

  if (!existing) {
    const hasQr = await paymentQrExists(table.restaurantId);
    const orderLabel =
      unpaidServed.length === 1
        ? `Order #${unpaidServed[0]!.orderNumber}`
        : `${unpaidServed.length} orders`;
    await prisma.alert.create({
      data: {
        type: "PAYMENT",
        message: hasQr
          ? `Table ${table.number} completed PhonePe payment (${orderLabel}) — ${formatCurrency(tabSummary.remaining)} (verify & mark paid)`
          : `Table ${table.number} needs to pay (${orderLabel}) — ${formatCurrency(tabSummary.remaining)} (collect cash/UPI offline)`,
        tableNumber: table.number,
        restaurantId: table.restaurantId,
        orderId: unpaidServed[0]?.id,
      },
    });
  }

  return {
    ok: true as const,
    paymentRequestedAt,
    billTotal: tabSummary.remaining,
    hasPaymentQr: await paymentQrExists(table.restaurantId),
    consolidated: unpaidServed.length > 1,
    openKitchen,
  };
}

export async function onTabPaymentProgress(tableId: string) {
  if (await isTabFullySettled(tableId)) {
    await clearTableTabFlags(tableId);
    await clearTablePaymentAlerts(tableId);
    return;
  }

  await clearTabPaymentRequestIfSettled(tableId);
  const summary = await getTableTabPaymentSummary(tableId);
  if (summary.remaining <= 0.01) {
    await clearTablePaymentAlerts(tableId);
  }
}

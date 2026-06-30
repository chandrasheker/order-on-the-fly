import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { logApiRequest, logInfo } from "@/lib/logger";
import {
  clearAlertsForOrderItem,
  serveTimelineUpdate,
  syncOrderStatus,
} from "@/lib/order-service";
import { clearPaymentAlerts, requestOrderPayment } from "@/lib/payment-service";
import { isOrderItemOpen } from "@/lib/utils";
import { assertCustomerDiningAccess } from "@/lib/customer-dining-guard";
import { maybeAutoCloseTableAfterPayment } from "@/lib/table-ordering-service";
import { canPerformOrderAction } from "@/lib/staff-permissions";
import {
  buildReceiptPayload,
  RECEIPT_ORDER_INCLUDE,
  RECEIPT_RESTAURANT_SELECT,
} from "@/lib/receipt-service";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { action, itemId, tableToken } = await req.json();
  logApiRequest("orders/[id]", "PATCH", { orderId: id, action, itemId });

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true, table: true },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (action === "alarm") {
    await prisma.order.update({
      where: { id },
      data: { alarmTriggered: true },
    });

    await prisma.alert.create({
      data: {
        type: "ALARM",
        message: `Table ${order.table.number} needs help! Order #${order.orderNumber}`,
        orderId: id,
        tableNumber: order.table.number,
        restaurantId: order.restaurantId,
      },
    });

    logInfo("api:orders/[id]", "Customer alarm triggered", {
      orderId: id,
      orderNumber: order.orderNumber,
      tableNumber: order.table.number,
    });

    return NextResponse.json({ success: true });
  }

  if (action === "dismiss-oos-notice") {
    if (!tableToken || order.table.qrToken !== tableToken) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const dining = await assertCustomerDiningAccess(req, tableToken);
    if (!dining.ok) {
      return NextResponse.json({ error: dining.error, code: dining.code }, { status: dining.status });
    }

    await prisma.order.update({
      where: { id },
      data: { oosNoticeDismissedAt: new Date() },
    });

    logInfo("api:orders/[id]", "Out-of-stock notice dismissed", {
      orderId: id,
      orderNumber: order.orderNumber,
      tableNumber: order.table.number,
    });

    return NextResponse.json({ success: true });
  }

  if (action === "request-payment" || action === "pay") {
    if (!tableToken) {
      return NextResponse.json({ error: "Table token required" }, { status: 400 });
    }

    const dining = await assertCustomerDiningAccess(req, String(tableToken));
    if (!dining.ok) {
      return NextResponse.json({ error: dining.error, code: dining.code }, { status: dining.status });
    }

    const result = await requestOrderPayment(id, String(tableToken));
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    logInfo("api:orders/[id]", "Customer requested payment", {
      orderId: id,
      orderNumber: order.orderNumber,
      tableNumber: order.table.number,
      billTotal: result.billTotal,
      hasPaymentQr: result.hasPaymentQr,
    });

    return NextResponse.json({
      success: true,
      paymentRequestedAt: result.paymentRequestedAt,
      billTotal: result.billTotal,
      tableBlocked: true,
    });
  }

  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (order.restaurantId !== session.restaurantId) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const staffActions = [
    "serve-item",
    "reject-item",
    "prepare-item",
    "ready-item",
    "serve-all",
    "mark-paid",
  ] as const;

  if (staffActions.includes(action as (typeof staffActions)[number])) {
    if (!canPerformOrderAction(session.role, action)) {
      return NextResponse.json({ error: "Action not allowed for your role" }, { status: 403 });
    }
  }

  if (action === "mark-paid") {
    if (order.status !== "SERVED") {
      return NextResponse.json(
        { error: "Order must be fully served before marking paid" },
        { status: 400 }
      );
    }
    if (order.paidAt) {
      return NextResponse.json({ error: "Order already marked paid" }, { status: 400 });
    }

    const paidAt = new Date();
    await prisma.order.update({
      where: { id },
      data: {
        paidAt,
        paidByUserId: session.id,
        paidByName: session.name,
      },
    });

    await clearPaymentAlerts(id);

    await maybeAutoCloseTableAfterPayment(order.tableId);

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.restaurantId },
      select: RECEIPT_RESTAURANT_SELECT,
    });

    const paidOrder = await prisma.order.findUnique({
      where: { id },
      include: RECEIPT_ORDER_INCLUDE,
    });

    const receipt =
      restaurant && paidOrder
        ? buildReceiptPayload(restaurant, { ...paidOrder, paidAt })
        : null;

    logInfo("api:orders/[id]", "Order marked paid", { orderId: id });
    return NextResponse.json({ success: true, receipt });
  }

  if (action === "serve-item" && itemId) {
    const orderItem = order.items.find((i) => i.id === itemId);
    const servedAt = new Date();
    const timeline = orderItem
      ? serveTimelineUpdate(orderItem.expectedReadyAt, servedAt, orderItem)
      : { isOverdue: false, missedTimeline: false, minutesLate: null };

    await prisma.orderItem.update({
      where: { id: itemId },
      data: {
        status: "SERVED",
        servedAt,
        servedByUserId: session.id,
        servedByName: session.name,
        ...timeline,
      },
    });

    await clearAlertsForOrderItem(itemId);
    await syncOrderStatus(id);

    logInfo("api:orders/[id]", "Item served", { orderId: id, itemId });
    return NextResponse.json({ success: true });
  }

  if (action === "reject-item" && itemId) {
    await prisma.orderItem.update({
      where: { id: itemId },
      data: {
        status: "UNAVAILABLE",
        isOverdue: false,
      },
    });

    await clearAlertsForOrderItem(itemId);
    await syncOrderStatus(id);

    logInfo("api:orders/[id]", "Item marked unavailable", { orderId: id, itemId });
    return NextResponse.json({ success: true });
  }

  if (action === "prepare-item" && itemId) {
    await prisma.orderItem.update({
      where: { id: itemId },
      data: {
        status: "PREPARING",
        preparedByUserId: session.id,
        preparedByName: session.name,
      },
    });
    await prisma.order.update({ where: { id }, data: { status: "PREPARING" } });
    return NextResponse.json({ success: true });
  }

  if (action === "ready-item" && itemId) {
    await prisma.orderItem.update({
      where: { id: itemId },
      data: {
        status: "READY",
        readyByUserId: session.id,
        readyByName: session.name,
      },
    });
    await prisma.order.update({ where: { id }, data: { status: "READY" } });
    return NextResponse.json({ success: true });
  }

  if (action === "serve-all") {
    const servedAt = new Date();
    for (const item of order.items) {
      if (!isOrderItemOpen(item.status)) continue;

      const timeline = serveTimelineUpdate(item.expectedReadyAt, servedAt, item);
      await prisma.orderItem.update({
        where: { id: item.id },
        data: {
          status: "SERVED",
          servedAt,
          servedByUserId: session.id,
          servedByName: session.name,
          ...timeline,
        },
      });
      await clearAlertsForOrderItem(item.id);
    }
    await syncOrderStatus(id);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

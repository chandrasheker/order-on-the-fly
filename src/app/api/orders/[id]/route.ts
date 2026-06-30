import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { logApiRequest, logInfo } from "@/lib/logger";
import {
  clearAlertsForOrderItem,
  serveTimelineUpdate,
  syncOrderStatus,
} from "@/lib/order-service";
import { requestOrderPayment } from "@/lib/payment-service";
import { recordFullOrderPayment, recordOrderPayment, orderItemHasPayment, finalizeOrderIfSettled } from "@/lib/payment-allocation-service";
import { buildReceiptForPaidOrder } from "@/lib/payment-receipt";
import { isOrderItemOpen } from "@/lib/utils";
import { assertCustomerDiningAccess } from "@/lib/customer-dining-guard";
import { canPerformOrderAction } from "@/lib/staff-permissions";
import { featureDisabledResponse } from "@/lib/feature-guard";
import { applyOrderTip } from "@/lib/tip-pool-service";
import { recordGuestPayment } from "@/lib/guest-crm-service";
import {
  recordAuditLog,
  roleRequiresRejectApproval,
  verifyManagerApproval,
} from "@/lib/audit-service";
import { getRestaurantFeatureFlags } from "@/lib/feature-flags";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { action, itemId, tableToken, amount, method, itemIds, note, tipAmount, managerUserId, managerPassword, reason } =
    await req.json();
  logApiRequest("orders/[id]", "PATCH", { orderId: id, action, itemId });

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true, table: true },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (action === "alarm") {
    if (!tableToken || order.table.qrToken !== tableToken) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const dining = await assertCustomerDiningAccess(req, String(tableToken));
    if (!dining.ok) {
      return NextResponse.json({ error: dining.error, code: dining.code }, { status: dining.status });
    }

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
    "record-payment",
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

    const result = await recordFullOrderPayment({
      orderId: id,
      method: method ?? "UPI",
      collectedByUserId: session.id,
      collectedByName: session.name,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    if (typeof tipAmount === "number" && tipAmount > 0) {
      await applyOrderTip(id, tipAmount);
    }

    if (result.fullyPaid && order.customerPhone) {
      const summary = result.summary;
      void recordGuestPayment({
        restaurantId: session.restaurantId,
        phone: order.customerPhone,
        amount: summary?.paid ?? 0,
      });
    }

    const receipt = result.fullyPaid
      ? await buildReceiptForPaidOrder(id, session.restaurantId)
      : null;

    logInfo("api:orders/[id]", "Order marked paid", { orderId: id, fullyPaid: result.fullyPaid });
    return NextResponse.json({
      success: true,
      summary: result.summary,
      fullyPaid: result.fullyPaid,
      receipt,
    });
  }

  if (action === "record-payment") {
    const blocked = await featureDisabledResponse(order.restaurantId, "split_bill");
    if (blocked) return blocked;

    if (order.status !== "SERVED") {
      return NextResponse.json(
        { error: "Order must be fully served before recording payment" },
        { status: 400 }
      );
    }

    const payAmount = typeof amount === "number" ? amount : parseFloat(String(amount));
    if (!payAmount || payAmount <= 0) {
      return NextResponse.json({ error: "Valid payment amount required" }, { status: 400 });
    }

    const result = await recordOrderPayment({
      orderId: id,
      amount: payAmount,
      method: method ?? "UPI",
      note,
      itemIds: Array.isArray(itemIds) ? itemIds : undefined,
      collectedByUserId: session.id,
      collectedByName: session.name,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const receipt = result.fullyPaid
      ? await buildReceiptForPaidOrder(id, session.restaurantId)
      : null;

    logInfo("api:orders/[id]", "Partial payment recorded", {
      orderId: id,
      amount: payAmount,
      fullyPaid: result.fullyPaid,
    });
    return NextResponse.json({
      success: true,
      summary: result.summary,
      fullyPaid: result.fullyPaid,
      receipt,
    });
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
    if (await orderItemHasPayment(itemId)) {
      return NextResponse.json(
        { error: "Cannot reject an item that has payment applied" },
        { status: 400 },
      );
    }

    const flags = await getRestaurantFeatureFlags(session.restaurantId);
    let approvedByUserId: string | undefined;
    let approvedByName: string | undefined;

    if (flags.audit_log && roleRequiresRejectApproval(session.role)) {
      if (!managerUserId || !managerPassword) {
        return NextResponse.json(
          { error: "Manager approval required (managerUserId + managerPassword)", code: "MANAGER_APPROVAL_REQUIRED" },
          { status: 403 },
        );
      }
      const approval = await verifyManagerApproval({
        restaurantId: session.restaurantId,
        approverUserId: String(managerUserId),
        approverPassword: String(managerPassword),
      });
      if (!approval.ok) {
        return NextResponse.json({ error: approval.error }, { status: 403 });
      }
      approvedByUserId = approval.user.id;
      approvedByName = approval.user.name;
    }

    const orderItem = order.items.find((i) => i.id === itemId);

    await prisma.orderItem.update({
      where: { id: itemId },
      data: {
        status: "UNAVAILABLE",
        isOverdue: false,
      },
    });

    await recordAuditLog({
      restaurantId: session.restaurantId,
      actionType: "REJECT_ITEM",
      entityId: itemId,
      reason: reason ? String(reason) : undefined,
      payload: {
        orderId: id,
        itemName: orderItem?.itemName,
        orderNumber: order.orderNumber,
      },
      actorUserId: session.id,
      actorName: session.name,
      approvedByUserId,
      approvedByName,
      requiresApproval: Boolean(approvedByUserId),
    });

    await clearAlertsForOrderItem(itemId);
    await syncOrderStatus(id);
    await finalizeOrderIfSettled(id);

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
    await syncOrderStatus(id);
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

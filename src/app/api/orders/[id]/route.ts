import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { logApiRequest, logInfo } from "@/lib/logger";
import {
  clearAlertsForOrderItem,
  serveTimelineUpdate,
  syncOrderStatus,
} from "@/lib/order-service";
import { transitionOrderItemDirect, InvalidOrderTransitionError } from "@/domains/orders/transitions";
import { requestOrderPayment } from "@/lib/payment-service";
import { recordFullOrderPayment, recordOrderPayment, recordTableTabFullPayment, orderItemHasPayment } from "@/lib/payment-allocation-service";
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
import { loadOrderByIdForRequest, opaqueNotFoundJson } from "@/platform/tenant-scope";
import { hasOnlyForeignOrderItemIds, scopedOrderItemIds } from "@/lib/order-item-guard";
import {
  requireOwnedOrderItem,
  requireOwnedOrderItemWithoutPayment,
} from "@/lib/staff-order-item-actions";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { action, itemId, tableToken, amount, method, itemIds, note, tipAmount, managerUserId, managerPassword, reason, payTab, cashTendered } =
    await req.json();
  logApiRequest("orders/[id]", "PATCH", { orderId: id, action, itemId });

  const { order, resolution } = await loadOrderByIdForRequest(req, id);
  if (!resolution.ok || !order) {
    return opaqueNotFoundJson();
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

  if (action === "initiate-manual-upi") {
    if (!tableToken || order.table.qrToken !== tableToken) {
      return opaqueNotFoundJson();
    }
    const dining = await assertCustomerDiningAccess(req, String(tableToken));
    if (!dining.ok) {
      return NextResponse.json({ error: dining.error, code: dining.code }, { status: dining.status });
    }
    const { PAYMENT_STATUS, MANUAL_UPI_VERIFICATION } = await import("@/lib/order-financials");
    const summary = await (await import("@/lib/payment-allocation-service")).getOrderPaymentSummary(id);
    if (!summary || summary.remaining <= 0.01) {
      return NextResponse.json({ error: "Nothing to pay" }, { status: 400 });
    }
    const result = await recordOrderPayment({
      orderId: id,
      amount: summary.remaining,
      method: "MANUAL_UPI",
      status: PAYMENT_STATUS.PENDING,
      verificationStatus: MANUAL_UPI_VERIFICATION.PENDING_VERIFICATION,
      capture: false,
      note: "Customer opened UPI — awaiting staff verification",
      idempotencyKey: `manual-upi-pending:${id}`,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    await requestOrderPayment(id, tableToken);
    return NextResponse.json({
      success: true,
      pending: true,
      message: "Payment recorded as pending. Staff will verify before the bill is marked paid.",
      summary: result.summary,
    });
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
      consolidated: result.consolidated,
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
    if (payTab) {
      const result = await recordTableTabFullPayment({
        tableId: order.tableId,
        method: method ?? "UPI",
        collectedByUserId: session.id,
        collectedByName: session.name,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      const receipt = await buildReceiptForPaidOrder(id, session.restaurantId);
      logInfo("api:orders/[id]", "Table tab marked paid", {
        tableId: order.tableId,
        orderCount: result.paidOrderIds.length,
      });
      return NextResponse.json({
        success: true,
        fullyPaid: true,
        paidOrderIds: result.paidOrderIds,
        receipt,
      });
    }

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
      cashTendered: typeof cashTendered === "number" ? cashTendered : undefined,
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

    let scopedItemIds: string[] | undefined;
    if (Array.isArray(itemIds) && itemIds.length > 0) {
      if (hasOnlyForeignOrderItemIds(order, itemIds)) {
        return opaqueNotFoundJson();
      }
      scopedItemIds = scopedOrderItemIds(order, itemIds);
    }

    const result = await recordOrderPayment({
      orderId: id,
      amount: payAmount,
      method: method ?? "UPI",
      note,
      itemIds: scopedItemIds,
      collectedByUserId: session.id,
      collectedByName: session.name,
      cashTendered: typeof cashTendered === "number" ? cashTendered : undefined,
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
    const owned = requireOwnedOrderItem(order, itemId, session.restaurantId);
    if (!owned.ok) return opaqueNotFoundJson();

    try {
      await transitionOrderItemDirect({
        orderId: id,
        itemId: owned.item.id,
        toStatus: "SERVED",
        actorUserId: session.id,
        actorName: session.name,
        restaurantId: session.restaurantId,
      });
    } catch (err) {
      if (err instanceof InvalidOrderTransitionError) {
        return NextResponse.json({ error: err.message, code: "INVALID_TRANSITION" }, { status: 409 });
      }
      throw err;
    }

    const servedAt = new Date();
    const timeline = serveTimelineUpdate(owned.item.expectedReadyAt, servedAt, owned.item);
    await prisma.orderItem.update({
      where: { id: owned.item.id },
      data: timeline,
    });

    logInfo("api:orders/[id]", "Item served", { orderId: id, itemId: owned.item.id });
    return NextResponse.json({ success: true });
  }

  if (action === "reject-item" && itemId) {
    const owned = await requireOwnedOrderItemWithoutPayment(
      order,
      itemId,
      session.restaurantId,
      orderItemHasPayment,
    );
    if (!owned.ok) {
      if (owned.status === 404) return opaqueNotFoundJson();
      return NextResponse.json({ error: owned.error }, { status: owned.status });
    }
    const orderItem = owned.item;

    const flags = await getRestaurantFeatureFlags(session.restaurantId);
    let approvedByUserId: string | undefined;
    let approvedByName: string | undefined;

    const isKitchenOos =
      session.role === "COOK" &&
      (orderItem.status === "PENDING" || orderItem.status === "PREPARING");

    if (flags.audit_log && roleRequiresRejectApproval(session.role) && !isKitchenOos) {
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

    try {
      await transitionOrderItemDirect({
        orderId: id,
        itemId: orderItem.id,
        toStatus: "UNAVAILABLE",
        actorUserId: session.id,
        actorName: session.name,
        restaurantId: session.restaurantId,
      });
    } catch (err) {
      if (err instanceof InvalidOrderTransitionError) {
        return NextResponse.json({ error: err.message, code: "INVALID_TRANSITION" }, { status: 409 });
      }
      throw err;
    }

    await recordAuditLog({
      restaurantId: session.restaurantId,
      actionType: "REJECT_ITEM",
      entityId: orderItem.id,
      reason: reason ? String(reason) : undefined,
      payload: {
        orderId: id,
        itemName: orderItem.itemName,
        orderNumber: order.orderNumber,
      },
      actorUserId: session.id,
      actorName: session.name,
      approvedByUserId,
      approvedByName,
      requiresApproval: Boolean(approvedByUserId),
    });

    logInfo("api:orders/[id]", "Item marked unavailable", { orderId: id, itemId: orderItem.id });
    return NextResponse.json({ success: true });
  }

  if (action === "prepare-item" && itemId) {
    const owned = requireOwnedOrderItem(order, itemId, session.restaurantId);
    if (!owned.ok) return opaqueNotFoundJson();
    try {
      await transitionOrderItemDirect({
        orderId: id,
        itemId: owned.item.id,
        toStatus: "PREPARING",
        actorUserId: session.id,
        actorName: session.name,
        restaurantId: session.restaurantId,
      });
    } catch (err) {
      if (err instanceof InvalidOrderTransitionError) {
        return NextResponse.json({ error: err.message, code: "INVALID_TRANSITION" }, { status: 409 });
      }
      throw err;
    }
    return NextResponse.json({ success: true });
  }

  if (action === "ready-item" && itemId) {
    const owned = requireOwnedOrderItem(order, itemId, session.restaurantId);
    if (!owned.ok) return opaqueNotFoundJson();
    try {
      await transitionOrderItemDirect({
        orderId: id,
        itemId: owned.item.id,
        toStatus: "READY",
        actorUserId: session.id,
        actorName: session.name,
        restaurantId: session.restaurantId,
      });
    } catch (err) {
      if (err instanceof InvalidOrderTransitionError) {
        return NextResponse.json({ error: err.message, code: "INVALID_TRANSITION" }, { status: 409 });
      }
      throw err;
    }
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

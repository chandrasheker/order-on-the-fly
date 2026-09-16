import { prisma } from "@/lib/prisma";
import { kitchenChitIdempotencyKey } from "@/lib/print-constants";
import { FINANCIAL_PAID_EPSILON, RESTAURANT_GST_SELECT } from "@/lib/order-financials";
import {
  isOrderCancelled,
  isOrderCollected,
  isSelfPickupOrder,
  loadOrderForCollection,
  outstandingAmountPaiseForCollection,
} from "@/lib/fulfillment/collection";
import { SelfPickupCollectionError } from "@/lib/fulfillment/errors";

export function isSelfPickupKitchenHeld(order: {
  status: string;
  fulfillmentMode?: string | null;
  collectedAt?: Date | string | null;
  items: Array<{ status: string; quantity: number; unitPrice: number }>;
  payments?: Array<{ amount: number; status?: string | null; refundOfPaymentId?: string | null }>;
  discountAmount?: number | null;
  gstEnabled?: boolean;
  gstRate?: number | null;
  gstInclusive?: boolean;
  restaurant?: {
    receiptGstEnabled?: boolean | null;
    receiptGstRate?: number | null;
    receiptGstInclusive?: boolean | null;
  } | null;
  bills?: Array<{
    status?: string | null;
    grandTotal: number;
    itemSubtotal?: number;
    orderDiscount?: number;
    gstAmount?: number;
    cgstAmount?: number;
    sgstAmount?: number;
  }> | null;
}): boolean {
  if (!isSelfPickupOrder(order)) return false;
  if (isOrderCancelled(order) || isOrderCollected(order)) return false;
  return outstandingAmountPaiseForCollection(order) > 0;
}

export async function selfPickupKitchenHeldOrderIds(
  orders: Array<{
    id: string;
    fulfillmentMode?: string | null;
    paidAt?: Date | string | null;
  }>,
): Promise<Set<string>> {
  const candidates = orders
    .filter((order) => order.fulfillmentMode === "SELF_PICKUP" && !order.paidAt)
    .map((order) => order.id);
  if (candidates.length === 0) return new Set();
  const { getOrderPaymentSummaries } = await import("@/lib/payment-allocation-service");
  const summaries = await getOrderPaymentSummaries(candidates);
  return new Set(
    candidates.filter((id) => (summaries.get(id)?.remaining ?? 0) > FINANCIAL_PAID_EPSILON),
  );
}

export async function throwIfSelfPickupKitchenHeld(restaurantId: string, orderId: string) {
  const order = await loadOrderForCollection(prisma, restaurantId, orderId);
  if (!order) return;
  if (!isSelfPickupKitchenHeld(order)) return;
  throw new SelfPickupCollectionError(
    "PAYMENT_REQUIRED",
    "I'll-collect orders go to the kitchen after payment.",
    409,
    outstandingAmountPaiseForCollection(order),
  );
}

export async function onSelfPickupSettled(orderId: string) {
  await releaseSelfPickupToKitchenIfPaid(orderId);
  const { evaluateSelfPickupNotifications } = await import("@/lib/fulfillment/notify");
  await evaluateSelfPickupNotifications(orderId);
}

export async function releaseSelfPickupToKitchenIfPaid(orderId: string): Promise<{
  released: boolean;
  alreadyReleased: boolean;
  held: boolean;
}> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      payments: true,
      table: { select: { number: true } },
      restaurant: { select: RESTAURANT_GST_SELECT },
      bills: {
        where: { status: "FINALIZED" },
        select: {
          status: true,
          grandTotal: true,
          itemSubtotal: true,
          orderDiscount: true,
          gstAmount: true,
          cgstAmount: true,
          sgstAmount: true,
        },
        take: 1,
      },
    },
  });
  if (!order || !isSelfPickupOrder(order) || order.status === "CANCELLED") {
    return { released: false, alreadyReleased: false, held: false };
  }
  if (outstandingAmountPaiseForCollection(order) > 0) {
    return { released: false, alreadyReleased: false, held: true };
  }

  const idempotencyKey = kitchenChitIdempotencyKey(order.id);
  const existing = await prisma.printJob.findFirst({
    where: { restaurantId: order.restaurantId, idempotencyKey },
    select: { id: true },
  });
  const alreadyReleased = Boolean(existing);

  if (!alreadyReleased) {
    const now = new Date();
    const pending = order.items.filter((item) => item.status === "PENDING");
    for (const item of pending) {
      await prisma.orderItem.update({
        where: { id: item.id },
        data: {
          expectedReadyAt: new Date(now.getTime() + item.prepTimeMinutes * 60 * 1000),
          isOverdue: false,
          missedTimeline: false,
          minutesLate: null,
        },
      });
    }
  }

  const { enqueueKitchenChitForOrder } = await import("@/domains/printing/print-job-service");
  await enqueueKitchenChitForOrder({
    restaurantId: order.restaurantId,
    tenantId: order.tenantId,
    branchId: order.branchId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    tableNumber: order.table.number,
    fulfillmentMode: order.fulfillmentMode,
    items: order.items.map((item) => ({
      name: item.itemName,
      quantity: item.quantity,
      notes: item.notes ?? null,
    })),
    createdAt: alreadyReleased ? order.createdAt : new Date(),
  });

  if (!alreadyReleased) {
    const { createNewKitchenItemAlertsForOrder } = await import("@/lib/kitchen-alert-service");
    await createNewKitchenItemAlertsForOrder(order.id);
    const { decrementInventoryForOrder } = await import("@/lib/inventory-service");
    await decrementInventoryForOrder(
      order.restaurantId,
      order.items.map((item) => ({ menuItemId: item.menuItemId, quantity: item.quantity })),
    );
    const { enqueueJob } = await import("@/lib/job-queue");
    void enqueueJob({
      type: "recipe_deduct",
      restaurantId: order.restaurantId,
      payload: {
        restaurantId: order.restaurantId,
        items: order.items.map((item) => ({ menuItemId: item.menuItemId, quantity: item.quantity })),
      },
    });
  }

  const { pingLive } = await import("@/lib/live-hub");
  pingLive({
    restaurantId: order.restaurantId,
    type: alreadyReleased ? "KITCHEN_ALREADY_RELEASED" : "KITCHEN_RELEASED",
    entityId: order.id,
    tableId: order.tableId,
  });

  return { released: !alreadyReleased, alreadyReleased, held: false };
}

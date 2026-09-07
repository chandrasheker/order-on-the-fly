import { prisma } from "@/lib/prisma";
import {
  SELF_PICKUP_COLLECTION_REMINDER_MS,
} from "@/lib/fulfillment/constants";
import {
  customerPickupState,
  isSelfPickupOrder,
  persistReadyAtIfNeeded,
  type CustomerPickupState,
} from "@/lib/fulfillment/collection";
import { formatCurrency } from "@/lib/utils";
import { fromPaise } from "@/lib/money";
import {
  AUDIT_ACTION,
  AUDIT_CATEGORY,
  AUDIT_OUTCOME,
} from "@/platform/forensics/constants";
import { appendPlatformAuditEvent } from "@/platform/forensics/platform-audit-service";

export type SelfPickupNotificationType =
  | "FOOD_READY_PAYMENT_REQUIRED"
  | "READY_FOR_COLLECTION"
  | "COLLECTION_REMINDER";

function notificationBody(
  type: SelfPickupNotificationType,
  pickupNumber: number,
  outstandingAmountPaise: number,
) {
  if (type === "FOOD_READY_PAYMENT_REQUIRED") {
    return `Pickup #${pickupNumber} is ready. ${formatCurrency(fromPaise(outstandingAmountPaise))} payment is required before collection.`;
  }
  if (type === "COLLECTION_REMINDER") {
    return `Pickup #${pickupNumber} is still waiting at the counter.`;
  }
  return `Pickup #${pickupNumber} is ready for collection.`;
}

async function persistNotification(
  orderId: string,
  type: SelfPickupNotificationType,
  now: Date,
) {
  if (type === "FOOD_READY_PAYMENT_REQUIRED") {
    await prisma.order.update({
      where: { id: orderId },
      data: { readyPaymentRequiredNotifiedAt: now },
    });
    return;
  }
  if (type === "COLLECTION_REMINDER") {
    await prisma.order.update({
      where: { id: orderId },
      data: { collectionReminderNotifiedAt: now },
    });
    return;
  }
  await prisma.order.update({
    where: { id: orderId },
    data: { readyForCollectionNotifiedAt: now },
  });
}

export async function evaluateSelfPickupNotifications(orderId: string): Promise<{
  state: CustomerPickupState | null;
  emitted: SelfPickupNotificationType | null;
}> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      payments: true,
      restaurant: { select: { pickupLocationLabel: true, name: true } },
      table: { select: { id: true } },
    },
  });
  if (!order || !isSelfPickupOrder(order) || order.status === "CANCELLED") {
    return { state: order?.status === "CANCELLED" ? "CANCELLED" : null, emitted: null };
  }

  await persistReadyAtIfNeeded(prisma, order);
  const refreshed = order.readyAt
    ? order
    : await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: true,
          payments: true,
          restaurant: { select: { pickupLocationLabel: true, name: true } },
          table: { select: { id: true } },
        },
      });
  if (!refreshed) return { state: null, emitted: null };

  const state = customerPickupState(refreshed);
  const outstanding = (await import("@/lib/fulfillment/collection")).outstandingAmountPaiseForCollection(
    refreshed,
  );
  const now = new Date();
  let type: SelfPickupNotificationType | null = null;

  if (state === "FOOD_READY_PAYMENT_REQUIRED" && !refreshed.readyPaymentRequiredNotifiedAt) {
    type = "FOOD_READY_PAYMENT_REQUIRED";
  } else if (state === "READY_FOR_COLLECTION" && !refreshed.readyForCollectionNotifiedAt) {
    type = "READY_FOR_COLLECTION";
  } else if (
    state === "READY_FOR_COLLECTION" &&
    refreshed.readyForCollectionNotifiedAt &&
    !refreshed.collectionReminderNotifiedAt &&
    refreshed.readyForCollectionNotifiedAt &&
    now.getTime() - refreshed.readyForCollectionNotifiedAt.getTime() >=
      SELF_PICKUP_COLLECTION_REMINDER_MS
  ) {
    type = "COLLECTION_REMINDER";
  }

  if (!type) return { state, emitted: null };

  await persistNotification(refreshed.id, type, now);
  await appendPlatformAuditEvent({
    category: type === "READY_FOR_COLLECTION" ? AUDIT_CATEGORY.ORDER : AUDIT_CATEGORY.ORDER,
    action:
      type === "READY_FOR_COLLECTION"
        ? AUDIT_ACTION.ORDER_READY_FOR_COLLECTION
        : AUDIT_ACTION.CUSTOMER_READY_NOTIFICATION_SENT,
    outcome: AUDIT_OUTCOME.SUCCESS,
    restaurantId: refreshed.restaurantId,
    actorType: "SYSTEM",
    resourceType: "Order",
    resourceId: refreshed.id,
    correlationId: refreshed.id,
    metadata: {
      orderId: refreshed.id,
      restaurantId: refreshed.restaurantId,
      fulfillmentMode: refreshed.fulfillmentMode,
      pickupNumber: refreshed.orderNumber,
      outstandingAmountPaise: outstanding,
      notificationType: type,
    },
  });
  if (type === "READY_FOR_COLLECTION") {
    await appendPlatformAuditEvent({
      category: AUDIT_CATEGORY.ORDER,
      action: AUDIT_ACTION.CUSTOMER_READY_NOTIFICATION_SENT,
      outcome: AUDIT_OUTCOME.SUCCESS,
      restaurantId: refreshed.restaurantId,
      actorType: "SYSTEM",
      resourceType: "Order",
      resourceId: refreshed.id,
      correlationId: refreshed.id,
      metadata: {
        orderId: refreshed.id,
        restaurantId: refreshed.restaurantId,
        fulfillmentMode: refreshed.fulfillmentMode,
        pickupNumber: refreshed.orderNumber,
        outstandingAmountPaise: 0,
        notificationType: type,
      },
    });
  }

  const { sendCustomerTablePush } = await import("@/lib/push-notification-service");
  await sendCustomerTablePush(refreshed.restaurantId, refreshed.tableId, {
    title: "TableTap",
    body: notificationBody(type, refreshed.orderNumber, outstanding),
    tag: `pickup-${refreshed.id}-${type}`,
    url: "/",
  });

  return { state, emitted: type };
}

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  financialsForOrder,
  type LedgerPayment,
  type OrderFinancialSummary,
} from "@/lib/order-financials";
import { countsTowardBillableTotal } from "@/lib/utils";
import {
  AUDIT_ACTION,
  AUDIT_CATEGORY,
  AUDIT_OUTCOME,
} from "@/platform/forensics/constants";
import {
  appendPlatformAuditEvent,
  appendPlatformAuditEventInTx,
} from "@/platform/forensics/platform-audit-service";
import {
  DEFAULT_ORDER_FULFILLMENT_MODE,
  isOrderFulfillmentMode,
  type OrderFulfillmentMode,
} from "@/lib/fulfillment/constants";
import { SelfPickupCollectionError } from "@/lib/fulfillment/errors";

export { SelfPickupCollectionError } from "@/lib/fulfillment/errors";

export type CollectionItem = {
  id?: string;
  status: string;
  quantity: number;
  unitPrice: number;
};

export type CollectionPayment = LedgerPayment;

export type OrderForCollection = {
  id: string;
  restaurantId: string;
  tableId: string;
  status: string;
  orderNumber: number;
  fulfillmentMode: string;
  pickupCode: string | null;
  readyAt: Date | null;
  collectedAt: Date | null;
  paidAt: Date | null;
  discountAmount: number;
  readyPaymentRequiredNotifiedAt: Date | null;
  readyForCollectionNotifiedAt: Date | null;
  collectionReminderNotifiedAt: Date | null;
  items: CollectionItem[];
  payments: CollectionPayment[];
};

const ORDER_COLLECTION_SELECT = {
  id: true,
  restaurantId: true,
  tableId: true,
  status: true,
  orderNumber: true,
  fulfillmentMode: true,
  pickupCode: true,
  readyAt: true,
  collectedAt: true,
  paidAt: true,
  discountAmount: true,
  readyPaymentRequiredNotifiedAt: true,
  readyForCollectionNotifiedAt: true,
  collectionReminderNotifiedAt: true,
  items: {
    select: {
      id: true,
      status: true,
      quantity: true,
      unitPrice: true,
    },
  },
  payments: {
    select: {
      amount: true,
      status: true,
      refundOfPaymentId: true,
    },
  },
} satisfies Prisma.OrderSelect;

export function isSelfPickupOrder(order: { fulfillmentMode?: string | null }): boolean {
  return order.fulfillmentMode === "SELF_PICKUP";
}

export function isTableServiceOrder(order: { fulfillmentMode?: string | null }): boolean {
  return (order.fulfillmentMode ?? DEFAULT_ORDER_FULFILLMENT_MODE) === "TABLE_SERVICE";
}

export function requiredItemsForReadiness(items: Array<{ status: string }>) {
  return items.filter((item) => countsTowardBillableTotal(item.status));
}

export function areRequiredItemsReady(items: Array<{ status: string }>): boolean {
  const required = requiredItemsForReadiness(items);
  if (required.length === 0) return false;
  return required.every((item) => item.status === "READY" || item.status === "SERVED");
}

export function isOrderCancelled(order: { status: string }): boolean {
  return order.status === "CANCELLED";
}

export function isOrderCollected(order: {
  status: string;
  collectedAt?: Date | string | null;
}): boolean {
  return Boolean(order.collectedAt);
}

/**
 * SELF_PICKUP settlement uses the same M1/M2 captured-allocation math as
 * TABLE_SERVICE, but bills every required item (not only already-SERVED).
 * READY food still has a real outstanding amount. TABLE_SERVICE is unchanged.
 */
export function settlementItemsForOrder<T extends { status: string }>(
  fulfillmentMode: string | null | undefined,
  items: T[],
): T[] {
  if (fulfillmentMode !== "SELF_PICKUP") {
    return items;
  }
  return items.map((item) =>
    item.status === "UNAVAILABLE" ? item : { ...item, status: "SERVED" as T["status"] },
  );
}

export function settlementFinancialsForOrder(order: {
  fulfillmentMode?: string | null;
  items: CollectionItem[];
  payments?: CollectionPayment[];
  discountAmount?: number | null;
  gstEnabled?: boolean;
  gstRate?: number | null;
}): OrderFinancialSummary {
  return financialsForOrder({
    items: settlementItemsForOrder(order.fulfillmentMode, order.items),
    payments: order.payments ?? [],
    discountAmount: order.discountAmount,
    gstEnabled: order.gstEnabled,
    gstRate: order.gstRate,
  });
}

export function outstandingAmountPaiseForCollection(order: {
  fulfillmentMode?: string | null;
  items: CollectionItem[];
  payments?: CollectionPayment[];
  discountAmount?: number | null;
  gstEnabled?: boolean;
  gstRate?: number | null;
}): number {
  return settlementFinancialsForOrder(order).amountDuePaise;
}

export type CollectionEligibility = {
  fulfillmentMode: OrderFulfillmentMode;
  cancelled: boolean;
  collected: boolean;
  foodReady: boolean;
  outstandingAmountPaise: number;
  financiallySettled: boolean;
  collectable: boolean;
  denyReason: null | "NOT_SELF_PICKUP" | "CANCELLED" | "NOT_READY" | "PAYMENT_REQUIRED";
};

export function evaluateCollectionEligibility(order: {
  status: string;
  fulfillmentMode?: string | null;
  collectedAt?: Date | string | null;
  items: CollectionItem[];
  payments?: CollectionPayment[];
  discountAmount?: number | null;
  gstEnabled?: boolean;
  gstRate?: number | null;
}): CollectionEligibility {
  const fulfillmentMode = isOrderFulfillmentMode(order.fulfillmentMode)
    ? order.fulfillmentMode
    : DEFAULT_ORDER_FULFILLMENT_MODE;
  const cancelled = isOrderCancelled(order);
  const collected = isOrderCollected(order);
  const foodReady = areRequiredItemsReady(order.items);
  const outstandingAmountPaise = outstandingAmountPaiseForCollection(order);
  const financiallySettled = outstandingAmountPaise === 0;

  if (fulfillmentMode !== "SELF_PICKUP") {
    return {
      fulfillmentMode,
      cancelled,
      collected,
      foodReady,
      outstandingAmountPaise,
      financiallySettled,
      collectable: false,
      denyReason: "NOT_SELF_PICKUP",
    };
  }
  if (cancelled) {
    return {
      fulfillmentMode,
      cancelled,
      collected,
      foodReady,
      outstandingAmountPaise,
      financiallySettled,
      collectable: false,
      denyReason: "CANCELLED",
    };
  }
  if (!foodReady) {
    return {
      fulfillmentMode,
      cancelled,
      collected,
      foodReady,
      outstandingAmountPaise,
      financiallySettled,
      collectable: false,
      denyReason: "NOT_READY",
    };
  }
  if (!financiallySettled) {
    return {
      fulfillmentMode,
      cancelled,
      collected,
      foodReady,
      outstandingAmountPaise,
      financiallySettled,
      collectable: false,
      denyReason: "PAYMENT_REQUIRED",
    };
  }
  return {
    fulfillmentMode,
    cancelled,
    collected,
    foodReady,
    outstandingAmountPaise,
    financiallySettled,
    collectable: true,
    denyReason: null,
  };
}

export type CustomerPickupState =
  | "PREPARING"
  | "FOOD_READY_PAYMENT_REQUIRED"
  | "READY_FOR_COLLECTION"
  | "COLLECTED"
  | "CANCELLED";

export function customerPickupState(order: {
  status: string;
  fulfillmentMode?: string | null;
  collectedAt?: Date | string | null;
  items: CollectionItem[];
  payments?: CollectionPayment[];
  discountAmount?: number | null;
}): CustomerPickupState {
  if (isOrderCancelled(order)) return "CANCELLED";
  if (isOrderCollected(order)) return "COLLECTED";
  const eligibility = evaluateCollectionEligibility(order);
  if (eligibility.collectable) return "READY_FOR_COLLECTION";
  if (eligibility.foodReady && !eligibility.financiallySettled) {
    return "FOOD_READY_PAYMENT_REQUIRED";
  }
  return "PREPARING";
}

export function publicPickupView(order: {
  status: string;
  fulfillmentMode?: string | null;
  orderNumber: number;
  pickupCode?: string | null;
  collectedAt?: Date | string | null;
  readyAt?: Date | string | null;
  items: CollectionItem[];
  payments?: CollectionPayment[];
  discountAmount?: number | null;
}, pickupLocationLabel?: string | null) {
  const eligibility = evaluateCollectionEligibility(order);
  const state = customerPickupState(order);
  return {
    fulfillmentMode: eligibility.fulfillmentMode,
    pickupNumber: order.orderNumber,
    pickupCode: order.pickupCode ?? null,
    pickupLocationLabel: pickupLocationLabel ?? "Pickup Counter",
    pickupState: isSelfPickupOrder(order) ? state : null,
    foodReady: eligibility.foodReady,
    outstandingAmountPaise: eligibility.outstandingAmountPaise,
    financiallySettled: eligibility.financiallySettled,
    collectable: eligibility.collectable,
    collected: eligibility.collected,
    readyAt: order.readyAt ?? null,
    collectedAt: order.collectedAt ?? null,
  };
}

export async function loadOrderForCollection(
  db: Prisma.TransactionClient | typeof prisma,
  restaurantId: string,
  orderId: string,
): Promise<OrderForCollection | null> {
  return db.order.findFirst({
    where: { id: orderId, restaurantId },
    select: ORDER_COLLECTION_SELECT,
  });
}

export function throwIfSelfPickupHandoverBlocked(order: {
  status: string;
  fulfillmentMode?: string | null;
  collectedAt?: Date | string | null;
  items: CollectionItem[];
  payments?: CollectionPayment[];
  discountAmount?: number | null;
}): void {
  if (!isSelfPickupOrder(order)) return;
  if (isOrderCollected(order)) return;
  const eligibility = evaluateCollectionEligibility(order);
  if (eligibility.denyReason === "PAYMENT_REQUIRED") {
    throw new SelfPickupCollectionError(
      "PAYMENT_REQUIRED",
      "Self-pickup orders cannot be handed over while an amount remains outstanding.",
      409,
      eligibility.outstandingAmountPaise,
    );
  }
  if (eligibility.denyReason === "CANCELLED") {
    throw new SelfPickupCollectionError(
      "CANCELLED",
      "Cancelled orders cannot be collected.",
      409,
      eligibility.outstandingAmountPaise,
    );
  }
  if (eligibility.denyReason === "NOT_READY") {
    throw new SelfPickupCollectionError(
      "NOT_READY",
      "All required items must be ready before collection.",
      409,
      eligibility.outstandingAmountPaise,
    );
  }
}

async function recordCollectionDenied(input: {
  order: OrderForCollection;
  actor: { id: string; role: string; name?: string | null };
  requestId?: string | null;
  outstandingAmountPaise: number;
}) {
  await appendPlatformAuditEvent({
    category: AUDIT_CATEGORY.ORDER,
    action: AUDIT_ACTION.SELF_SERVICE_COLLECTION_DENIED,
    outcome: AUDIT_OUTCOME.DENIED,
    restaurantId: input.order.restaurantId,
    actorType: "STAFF",
    actorId: input.actor.id,
    actorRole: input.actor.role,
    actorName: input.actor.name ?? null,
    requestId: input.requestId,
    resourceType: "Order",
    resourceId: input.order.id,
    correlationId: input.order.id,
    metadata: {
      orderId: input.order.id,
      restaurantId: input.order.restaurantId,
      fulfillmentMode: input.order.fulfillmentMode,
      pickupNumber: input.order.orderNumber,
      outstandingAmountPaise: input.outstandingAmountPaise,
      reason: "PAYMENT_REQUIRED",
    },
  });
}

function throwCollectionDenied(order: OrderForCollection, eligibility: CollectionEligibility): never {
  if (eligibility.denyReason === "CANCELLED") {
    throw new SelfPickupCollectionError(
      "CANCELLED",
      "Cancelled orders cannot be collected.",
      409,
      eligibility.outstandingAmountPaise,
    );
  }
  if (eligibility.denyReason === "NOT_READY") {
    throw new SelfPickupCollectionError(
      "NOT_READY",
      "All required items must be ready before collection.",
      409,
      eligibility.outstandingAmountPaise,
    );
  }
  throw new SelfPickupCollectionError(
    "PAYMENT_REQUIRED",
    "Self-pickup orders cannot be handed over while an amount remains outstanding.",
    409,
    eligibility.outstandingAmountPaise,
  );
}

export async function markSelfPickupCollected(input: {
  restaurantId: string;
  orderId: string;
  actor: { id: string; role: string; name?: string | null };
  requestId?: string | null;
}): Promise<OrderForCollection> {
  const preview = await loadOrderForCollection(prisma, input.restaurantId, input.orderId);
  if (!preview) {
    throw new SelfPickupCollectionError("NOT_FOUND", "Order not found.", 404);
  }
  if (!isSelfPickupOrder(preview)) {
    throw new SelfPickupCollectionError(
      "NOT_SELF_PICKUP",
      "Only self-pickup orders use Mark Collected.",
      400,
    );
  }
  if (isOrderCollected(preview)) {
    return preview;
  }
  const previewEligibility = evaluateCollectionEligibility(preview);
  if (previewEligibility.denyReason === "PAYMENT_REQUIRED") {
    await recordCollectionDenied({
      order: preview,
      actor: input.actor,
      requestId: input.requestId,
      outstandingAmountPaise: previewEligibility.outstandingAmountPaise,
    });
    throwCollectionDenied(preview, previewEligibility);
  }
  if (previewEligibility.denyReason) {
    throwCollectionDenied(preview, previewEligibility);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const order = await loadOrderForCollection(tx, input.restaurantId, input.orderId);
      if (!order) {
        throw new SelfPickupCollectionError("NOT_FOUND", "Order not found.", 404);
      }
      if (!isSelfPickupOrder(order)) {
        throw new SelfPickupCollectionError(
          "NOT_SELF_PICKUP",
          "Only self-pickup orders use Mark Collected.",
          400,
        );
      }
      if (isOrderCollected(order)) {
        return order;
      }

      const eligibility = evaluateCollectionEligibility(order);
      if (eligibility.denyReason === "PAYMENT_REQUIRED") {
        throwCollectionDenied(order, eligibility);
      }
      if (eligibility.denyReason) {
        throwCollectionDenied(order, eligibility);
      }

      const collectedAt = new Date();
      await tx.orderItem.updateMany({
        where: {
          orderId: order.id,
          status: { in: ["PENDING", "PREPARING", "READY"] },
        },
        data: {
          status: "SERVED",
          servedAt: collectedAt,
          servedByUserId: input.actor.id,
          servedByName: input.actor.name ?? null,
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: "SERVED",
          collectedAt,
          readyAt: order.readyAt ?? collectedAt,
          paidAt: order.paidAt ?? collectedAt,
        },
      });

      await appendPlatformAuditEventInTx(tx, {
        category: AUDIT_CATEGORY.ORDER,
        action: AUDIT_ACTION.ORDER_COLLECTED,
        outcome: AUDIT_OUTCOME.SUCCESS,
        restaurantId: order.restaurantId,
        actorType: "STAFF",
        actorId: input.actor.id,
        actorRole: input.actor.role,
        actorName: input.actor.name ?? null,
        requestId: input.requestId,
        resourceType: "Order",
        resourceId: order.id,
        correlationId: order.id,
        before: { status: order.status, collectedAt: null },
        after: { status: "SERVED", collectedAt: collectedAt.toISOString() },
        metadata: {
          orderId: order.id,
          restaurantId: order.restaurantId,
          fulfillmentMode: order.fulfillmentMode,
          pickupNumber: order.orderNumber,
          outstandingAmountPaise: 0,
        },
      });

      const collected = await loadOrderForCollection(tx, input.restaurantId, input.orderId);
      if (!collected) {
        throw new SelfPickupCollectionError("NOT_FOUND", "Order not found after collection.", 404);
      }
      return collected;
    });
  } catch (error) {
    if (error instanceof SelfPickupCollectionError && error.code === "PAYMENT_REQUIRED") {
      const latest = await loadOrderForCollection(prisma, input.restaurantId, input.orderId);
      if (latest && !isOrderCollected(latest)) {
        await recordCollectionDenied({
          order: latest,
          actor: input.actor,
          requestId: input.requestId,
          outstandingAmountPaise: error.outstandingAmountPaise ?? 0,
        });
      }
    }
    throw error;
  }
}

export async function persistReadyAtIfNeeded(
  db: Prisma.TransactionClient | typeof prisma,
  order: { id: string; readyAt?: Date | null; items: Array<{ status: string }> },
): Promise<Date | null> {
  if (order.readyAt) return order.readyAt;
  if (!areRequiredItemsReady(order.items)) return null;
  const readyAt = new Date();
  await db.order.update({
    where: { id: order.id },
    data: { readyAt },
  });
  return readyAt;
}

export function collectionErrorToJson(error: SelfPickupCollectionError) {
  return {
    error: error.message,
    code: error.code,
    ...(error.outstandingAmountPaise != null
      ? { outstandingAmountPaise: error.outstandingAmountPaise }
      : {}),
  };
}

export function shouldSkipTableAutoClose(order: { fulfillmentMode?: string | null }): boolean {
  return isSelfPickupOrder(order);
}

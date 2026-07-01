import { prisma } from "@/lib/prisma";
import type { PlatformEventType } from "@/generated/prisma/client";
import { enqueueJob } from "@/lib/job-queue";

export type PlatformEventPayload = {
  restaurantId: string;
  tenantId?: string | null;
  branchId?: string | null;
  floorId?: string | null;
  type: PlatformEventType;
  entityId?: string;
  payload?: Record<string, unknown>;
};

export type EventSubscriber = (event: PlatformEventPayload) => Promise<void>;

const subscribers = new Map<PlatformEventType | "*", EventSubscriber[]>();

export function subscribe(eventType: PlatformEventType | "*", handler: EventSubscriber) {
  const list = subscribers.get(eventType) ?? [];
  list.push(handler);
  subscribers.set(eventType, list);
}

export async function recordPlatformEvent(params: PlatformEventPayload) {
  return prisma.platformEvent.create({
    data: {
      restaurantId: params.restaurantId,
      tenantId: params.tenantId ?? null,
      branchId: params.branchId ?? null,
      floorId: params.floorId ?? null,
      type: params.type,
      entityId: params.entityId ?? null,
      payload: params.payload ? JSON.stringify(params.payload) : null,
    },
  });
}

async function dispatchToSubscribers(event: PlatformEventPayload) {
  const handlers = [
    ...(subscribers.get(event.type) ?? []),
    ...(subscribers.get("*") ?? []),
  ];
  for (const handler of handlers) {
    try {
      await handler(event);
    } catch {
      /* subscriber errors must not break publish */
    }
  }
}

/** Publish event: persist + notify subscribers (async via job queue by default). */
export async function publishPlatformEvent(params: PlatformEventPayload) {
  if (process.env.EVENT_BUS_INLINE === "1") {
    await recordPlatformEvent(params);
    await dispatchToSubscribers(params);
    return;
  }

  await enqueueJob({
    type: "platform_event",
    restaurantId: params.restaurantId,
    payload: params as unknown as Record<string, unknown>,
  });
}

export async function processPlatformEventJob(payload: PlatformEventPayload) {
  await recordPlatformEvent(payload);
  await dispatchToSubscribers(payload);
}

export async function emitOrderCreated(params: {
  restaurantId: string;
  tenantId?: string | null;
  branchId?: string | null;
  floorId?: string | null;
  orderId: string;
  orderNumber: number;
  total: number;
  tableNumber: number;
}) {
  await publishPlatformEvent({
    restaurantId: params.restaurantId,
    tenantId: params.tenantId,
    branchId: params.branchId,
    floorId: params.floorId,
    type: "ORDER_CREATED",
    entityId: params.orderId,
    payload: {
      orderNumber: params.orderNumber,
      total: params.total,
      tableNumber: params.tableNumber,
    },
  });
}

export async function emitOrderPaid(params: {
  restaurantId: string;
  tenantId?: string | null;
  branchId?: string | null;
  orderId: string;
  amount: number;
}) {
  await publishPlatformEvent({
    restaurantId: params.restaurantId,
    tenantId: params.tenantId,
    branchId: params.branchId,
    type: "ORDER_PAID",
    entityId: params.orderId,
    payload: { amount: params.amount },
  });
}

// Legacy alias
export const emitPlatformEvent = publishPlatformEvent;

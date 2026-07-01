import { prisma } from "@/lib/prisma";
import type { PlatformEventType } from "@/generated/prisma/client";
import { enqueueJob } from "@/lib/job-queue";
import { formatCurrency } from "@/lib/utils";

export async function recordPlatformEvent(params: {
  restaurantId: string;
  branchId?: string | null;
  type: PlatformEventType;
  entityId?: string;
  payload?: Record<string, unknown>;
}) {
  return prisma.platformEvent.create({
    data: {
      restaurantId: params.restaurantId,
      branchId: params.branchId ?? null,
      type: params.type,
      entityId: params.entityId ?? null,
      payload: params.payload ? JSON.stringify(params.payload) : null,
    },
  });
}

export async function emitPlatformEvent(params: {
  restaurantId: string;
  branchId?: string | null;
  type: PlatformEventType;
  entityId?: string;
  payload?: Record<string, unknown>;
}) {
  if (process.env.EVENT_BUS_INLINE === "1") {
    return recordPlatformEvent(params);
  }

  return enqueueJob({
    type: "analytics",
    restaurantId: params.restaurantId,
    payload: params as unknown as Record<string, unknown>,
  });
}

export async function emitOrderCreated(params: {
  restaurantId: string;
  branchId?: string | null;
  orderId: string;
  orderNumber: number;
  total: number;
  tableNumber: number;
}) {
  await emitPlatformEvent({
    restaurantId: params.restaurantId,
    branchId: params.branchId,
    type: "ORDER_CREATED",
    entityId: params.orderId,
    payload: {
      restaurantId: params.restaurantId,
      branchId: params.branchId,
      type: "ORDER_CREATED",
      entityId: params.orderId,
      orderNumber: params.orderNumber,
      total: params.total,
      tableNumber: params.tableNumber,
    },
  });

  const { dispatchRealtimeNotifications } = await import("@/lib/outbound-notification-service");
  void dispatchRealtimeNotifications({
    restaurantId: params.restaurantId,
    type: "NEW_ORDER",
    title: `New order #${params.orderNumber}`,
    body: `Table ${params.tableNumber} — ${formatCurrency(params.total)}`,
    tableNumber: params.tableNumber,
    urgent: true,
  });
}

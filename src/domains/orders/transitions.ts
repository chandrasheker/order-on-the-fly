import { prisma } from "@/lib/prisma";
import {
  canTransitionOrderItem,
  deriveOrderStatus,
  nextOrderItemStatus,
  type OrderItemTransition,
  InvalidOrderTransitionError,
} from "@/domains/orders/state-machine";
import { syncOrderStatus } from "@/lib/order-service";
import { clearAlertsForOrderItem } from "@/lib/order-service";
import { publishPlatformEvent } from "@/platform/event-bus";
import type { OrderItemStatus } from "@/generated/prisma/client";

export { InvalidOrderTransitionError };

export async function transitionOrderItem(params: {
  orderId: string;
  itemId: string;
  transition: OrderItemTransition;
  actorUserId?: string;
  actorName?: string;
  restaurantId: string;
  tenantId?: string | null;
  branchId?: string | null;
}) {
  const item = await prisma.orderItem.findFirst({
    where: { id: params.itemId, orderId: params.orderId },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          restaurantId: true,
          tenantId: true,
          branchId: true,
          floorId: true,
          table: { select: { number: true } },
        },
      },
    },
  });
  if (!item) throw new Error("Order item not found");
  if (item.order.restaurantId !== params.restaurantId) throw new Error("Forbidden");

  const from = item.status as OrderItemStatus;
  if (!canTransitionOrderItem(from, params.transition)) {
    throw new InvalidOrderTransitionError(
      `Cannot ${params.transition} from ${from}`,
      from,
      params.transition,
    );
  }

  const to = nextOrderItemStatus(from, params.transition);
  const now = new Date();
  const data: Record<string, unknown> = { status: to };

  if (params.transition === "start-preparing" || (params.transition === "mark-ready" && from === "PENDING")) {
    data.preparedByUserId = params.actorUserId ?? null;
    data.preparedByName = params.actorName ?? null;
  }
  if (params.transition === "mark-ready") {
    data.readyByUserId = params.actorUserId ?? null;
    data.readyByName = params.actorName ?? null;
  }
  if (params.transition === "mark-served") {
    data.servedAt = now;
    data.servedByUserId = params.actorUserId ?? null;
    data.servedByName = params.actorName ?? null;
    data.isOverdue = false;
  }
  if (params.transition === "mark-unavailable") {
    data.isOverdue = false;
  }

  await prisma.orderItem.update({ where: { id: params.itemId }, data });
  if (params.transition === "mark-unavailable" || params.transition === "mark-served") {
    await clearAlertsForOrderItem(params.itemId);
  }

  const allItems = await prisma.orderItem.findMany({ where: { orderId: params.orderId } });
  const orderStatus = deriveOrderStatus(allItems.map((i) => i.status));
  await prisma.order.update({ where: { id: params.orderId }, data: { status: orderStatus } });
  await syncOrderStatus(params.orderId);

  const order = item.order;
  if (params.transition === "mark-ready") {
    void publishPlatformEvent({
      restaurantId: order.restaurantId,
      tenantId: order.tenantId ?? params.tenantId ?? undefined,
      branchId: order.branchId ?? params.branchId,
      floorId: order.floorId,
      type: "ORDER_UPDATED",
      entityId: params.orderId,
      payload: {
        event: "ORDER_READY",
        orderNumber: order.orderNumber,
        tableNumber: order.table.number,
        itemId: params.itemId,
      },
    });

    const readyItem = await prisma.orderItem.findUnique({
      where: { id: params.itemId },
      select: { itemName: true, quantity: true },
    });
    if (readyItem) {
      const { notifyItemReadyStaff } = await import("@/lib/kitchen-alert-service");
      void notifyItemReadyStaff({
        orderId: params.orderId,
        orderItemId: params.itemId,
        itemName: readyItem.itemName,
        quantity: readyItem.quantity,
      });
    }
  }

  return { from, to, orderStatus };
}

export async function transitionOrderItemDirect(params: {
  orderId: string;
  itemId: string;
  toStatus: OrderItemStatus;
  actorUserId?: string;
  actorName?: string;
  restaurantId: string;
}) {
  const map: Partial<Record<OrderItemStatus, OrderItemTransition>> = {
    PREPARING: "start-preparing",
    READY: "mark-ready",
    SERVED: "mark-served",
    UNAVAILABLE: "mark-unavailable",
  };
  const transition = map[params.toStatus];
  if (!transition) throw new Error(`Unsupported direct status ${params.toStatus}`);
  return transitionOrderItem({ ...params, transition });
}

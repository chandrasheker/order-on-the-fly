import type { EventSubscriber } from "@/platform/event-bus";
import { subscribe } from "@/platform/event-bus";
import { prisma } from "@/lib/prisma";
import { enqueueKitchenChitForOrder } from "@/domains/printing/print-job-service";

const printSubscriber: EventSubscriber = async (event) => {
  if (event.type !== "ORDER_CREATED") return;
  const orderId = event.entityId;
  if (!orderId) return;

  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId: event.restaurantId },
    include: { items: true, table: { select: { number: true } } },
  });

  await enqueueKitchenChitForOrder({
    restaurantId: event.restaurantId,
    tenantId: event.tenantId,
    branchId: event.branchId,
    orderId,
    orderNumber: Number(order?.orderNumber ?? event.payload?.orderNumber ?? 0),
    tableNumber: Number(order?.table?.number ?? event.payload?.tableNumber ?? 0),
    items: order?.items.map((item) => ({
      name: item.itemName,
      quantity: item.quantity,
      notes: item.notes ?? null,
    })),
    createdAt: order?.createdAt,
  });
};

subscribe("ORDER_CREATED", printSubscriber);

import { prisma } from "@/lib/prisma";
import { formatOrderLocation } from "@/lib/order-channel";

export type KitchenChitPayload = {
  restaurantName: string;
  orderNumber: number;
  locationLabel: string;
  orderChannel: string;
  customerName: string | null;
  customerPhone: string | null;
  externalOrderId: string | null;
  orderNotes: string | null;
  placedByName: string | null;
  createdAt: string;
  items: Array<{
    name: string;
    quantity: number;
    notes: string | null;
    categoryName: string;
  }>;
};

export async function buildKitchenChitPayload(orderId: string): Promise<KitchenChitPayload | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      restaurant: { select: { name: true } },
      table: { select: { number: true, kind: true, serviceLabel: true } },
      items: {
        include: {
          menuItem: { include: { category: { select: { name: true } } } },
        },
        orderBy: { expectedReadyAt: "asc" },
      },
    },
  });

  if (!order) return null;

  return {
    restaurantName: order.restaurant.name,
    orderNumber: order.orderNumber,
    locationLabel: formatOrderLocation({
      orderChannel: order.orderChannel,
      tableNumber: order.table.number,
      tableKind: order.table.kind,
      serviceLabel: order.table.serviceLabel,
    }),
    orderChannel: order.orderChannel,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    externalOrderId: order.externalOrderId,
    orderNotes: order.orderNotes,
    placedByName: order.placedByName,
    createdAt: order.createdAt.toISOString(),
    items: order.items.map((item) => ({
      name: item.itemName,
      quantity: item.quantity,
      notes: item.notes,
      categoryName: item.menuItem.category.name,
    })),
  };
}

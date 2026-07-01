import { prisma } from "@/lib/prisma";

export async function createNewKitchenItemAlert(params: {
  restaurantId: string;
  tenantId?: string | null;
  branchId?: string | null;
  orderId: string;
  orderItemId: string;
  tableNumber: number;
  itemName: string;
  quantity: number;
  categorySlug: string;
  orderNumber: number;
}) {
  const existing = await prisma.alert.findFirst({
    where: {
      orderItemId: params.orderItemId,
      type: "NEW_KITCHEN_ITEM",
      isRead: false,
    },
  });
  if (existing) return existing;

  return prisma.alert.create({
    data: {
      type: "NEW_KITCHEN_ITEM",
      message: `New: ${params.quantity}x ${params.itemName} · order #${params.orderNumber}`,
      orderId: params.orderId,
      orderItemId: params.orderItemId,
      tableNumber: params.tableNumber,
      restaurantId: params.restaurantId,
      tenantId: params.tenantId ?? null,
      branchId: params.branchId ?? null,
      categorySlug: params.categorySlug,
    },
  });
}

export async function createItemReadyAlert(params: {
  restaurantId: string;
  tenantId?: string | null;
  branchId?: string | null;
  orderId: string;
  orderItemId: string;
  tableNumber: number;
  itemName: string;
  quantity: number;
  targetUserId: string;
  orderNumber: number;
  locationLabel?: string;
}) {
  const existing = await prisma.alert.findFirst({
    where: {
      orderItemId: params.orderItemId,
      type: "ITEM_READY",
      targetUserId: params.targetUserId,
      isRead: false,
    },
  });
  if (existing) return existing;

  const where = params.locationLabel ?? `Table ${params.tableNumber}`;
  return prisma.alert.create({
    data: {
      type: "ITEM_READY",
      message: `Ready to bump: ${params.quantity}x ${params.itemName} · ${where} · order #${params.orderNumber}`,
      orderId: params.orderId,
      orderItemId: params.orderItemId,
      tableNumber: params.tableNumber,
      restaurantId: params.restaurantId,
      tenantId: params.tenantId ?? null,
      branchId: params.branchId ?? null,
      targetUserId: params.targetUserId,
    },
  });
}

export async function notifyItemReadyStaff(params: {
  orderId: string;
  orderItemId: string;
  itemName: string;
  quantity: number;
}) {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: {
      table: { select: { number: true, kind: true, serviceLabel: true, assignedServerId: true } },
    },
  });
  if (!order) return;

  const { formatOrderLocation } = await import("@/lib/order-channel");
  const locationLabel = formatOrderLocation({
    orderChannel: order.orderChannel,
    tableNumber: order.table.number,
    tableKind: order.table.kind,
    serviceLabel: order.table.serviceLabel,
  });

  const targets = new Set<string>();
  if (order.placedByUserId) targets.add(order.placedByUserId);
  if (order.table.assignedServerId) targets.add(order.table.assignedServerId);

  for (const targetUserId of targets) {
    await createItemReadyAlert({
      restaurantId: order.restaurantId,
      tenantId: order.tenantId,
      branchId: order.branchId,
      orderId: order.id,
      orderItemId: params.orderItemId,
      tableNumber: order.table.number,
      itemName: params.itemName,
      quantity: params.quantity,
      targetUserId,
      orderNumber: order.orderNumber,
      locationLabel,
    });
  }
}

export async function createNewKitchenItemAlertsForOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          menuItem: { include: { category: { select: { slug: true } } } },
        },
      },
      table: { select: { number: true } },
    },
  });
  if (!order) return;

  for (const item of order.items) {
    if (item.status !== "PENDING") continue;
    await createNewKitchenItemAlert({
      restaurantId: order.restaurantId,
      tenantId: order.tenantId,
      branchId: order.branchId,
      orderId: order.id,
      orderItemId: item.id,
      tableNumber: order.table.number,
      itemName: item.itemName,
      quantity: item.quantity,
      categorySlug: item.menuItem.category.slug,
      orderNumber: order.orderNumber,
    });
  }
}

import { prisma } from "@/lib/prisma";
import { todayDateString } from "@/lib/utils";

export async function getNextOrderNumber(restaurantId: string) {
  const today = todayDateString();
  const last = await prisma.order.findFirst({
    where: { restaurantId, date: today },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  return (last?.orderNumber ?? 0) + 1;
}

export async function checkOverdueItems(restaurantId: string) {
  const now = new Date();
  const overdueItems = await prisma.orderItem.findMany({
    where: {
      isOverdue: false,
      servedAt: null,
      status: { not: "SERVED" },
      expectedReadyAt: { lt: now },
      order: { restaurantId, status: { not: "SERVED" } },
    },
    include: {
      order: { include: { table: true } },
    },
  });

  for (const item of overdueItems) {
    await prisma.orderItem.update({
      where: { id: item.id },
      data: { isOverdue: true },
    });

    const existing = await prisma.alert.findFirst({
      where: {
        orderItemId: item.id,
        type: "OVERDUE",
        isRead: false,
      },
    });

    if (!existing) {
      await prisma.alert.create({
        data: {
          type: "OVERDUE",
          message: `Table ${item.order.table.number}: ${item.itemName} is overdue! Expected ${item.prepTimeMinutes} min.`,
          orderId: item.orderId,
          orderItemId: item.id,
          tableNumber: item.order.table.number,
          restaurantId,
        },
      });
    }
  }

  return overdueItems.length;
}

export async function getActiveOrders(restaurantId: string) {
  await checkOverdueItems(restaurantId);

  return prisma.order.findMany({
    where: {
      restaurantId,
      date: todayDateString(),
      status: { notIn: ["SERVED", "CANCELLED"] },
    },
    include: {
      table: true,
      items: {
        include: { menuItem: { include: { category: true } } },
        orderBy: { expectedReadyAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getTodayOrders(restaurantId: string) {
  return prisma.order.findMany({
    where: { restaurantId, date: todayDateString() },
    include: {
      table: true,
      items: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

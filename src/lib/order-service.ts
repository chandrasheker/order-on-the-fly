import { prisma } from "@/lib/prisma";
import { todayDateString } from "@/lib/utils";

export function minutesLateFromExpected(expectedReadyAt: Date, at = new Date()) {
  const diffMs = at.getTime() - expectedReadyAt.getTime();
  return diffMs > 0 ? Math.ceil(diffMs / 60000) : 0;
}

export function serveTimelineUpdate(
  expectedReadyAt: Date,
  servedAt = new Date(),
  existing?: { missedTimeline?: boolean; minutesLate?: number | null }
) {
  const late = minutesLateFromExpected(expectedReadyAt, servedAt);
  if (late <= 0 && !existing?.missedTimeline) {
    return { isOverdue: false, missedTimeline: false, minutesLate: null as number | null };
  }
  const minutesLate = Math.max(late, existing?.minutesLate ?? 0);
  return {
    isOverdue: false,
    missedTimeline: true,
    minutesLate: minutesLate > 0 ? minutesLate : existing?.minutesLate ?? null,
  };
}

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
    const minutesLate = minutesLateFromExpected(item.expectedReadyAt, now);
    await prisma.orderItem.update({
      where: { id: item.id },
      data: {
        isOverdue: true,
        missedTimeline: true,
        minutesLate,
      },
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

export async function getMissedTimelineItems(restaurantId: string) {
  await checkOverdueItems(restaurantId);

  const items = await prisma.orderItem.findMany({
    where: {
      missedTimeline: true,
      order: { restaurantId, date: todayDateString() },
    },
    include: {
      order: { include: { table: true } },
      menuItem: { select: { id: true, prepTimeMinutes: true } },
    },
    orderBy: { expectedReadyAt: "desc" },
  });

  const summaryMap = new Map<
    string,
    { itemName: string; count: number; totalMinutesLate: number; prepTimeMinutes: number }
  >();

  for (const item of items) {
    const existing = summaryMap.get(item.itemName);
    const late = item.minutesLate ?? 0;
    if (existing) {
      existing.count += 1;
      existing.totalMinutesLate += late;
    } else {
      summaryMap.set(item.itemName, {
        itemName: item.itemName,
        count: 1,
        totalMinutesLate: late,
        prepTimeMinutes: item.prepTimeMinutes,
      });
    }
  }

  const summary = Array.from(summaryMap.values())
    .map((s) => ({
      ...s,
      avgMinutesLate: s.count > 0 ? Math.round(s.totalMinutesLate / s.count) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return { items, summary };
}

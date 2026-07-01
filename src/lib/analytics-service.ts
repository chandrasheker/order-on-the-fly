import { prisma } from "@/lib/prisma";
import { todayDateString } from "@/lib/utils";
import type { PlatformEventType } from "@/generated/prisma/client";

export async function getAnalyticsSummary(restaurantId: string, date?: string) {
  const d = date ?? todayDateString();
  const dayStart = new Date(`${d}T00:00:00.000`);
  const dayEnd = new Date(`${d}T23:59:59.999`);

  const [orders, events, payments, eventBreakdown] = await Promise.all([
    prisma.order.count({
      where: { restaurantId, date: d, status: { not: "CANCELLED" } },
    }),
    prisma.platformEvent.count({
      where: { restaurantId, createdAt: { gte: dayStart, lte: dayEnd } },
    }),
    prisma.payment.aggregate({
      where: { restaurantId, createdAt: { gte: dayStart, lte: dayEnd } },
      _sum: { amount: true },
    }),
    prisma.platformEvent.groupBy({
      by: ["type"],
      where: { restaurantId, createdAt: { gte: dayStart, lte: dayEnd } },
      _count: { _all: true },
    }),
  ]);

  return {
    date: d,
    orders,
    events,
    revenue: payments._sum.amount ?? 0,
    eventBreakdown: eventBreakdown.map((e) => ({
      type: e.type as PlatformEventType,
      count: e._count._all,
    })),
  };
}

export async function listRecentEvents(restaurantId: string, limit = 50) {
  return prisma.platformEvent.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

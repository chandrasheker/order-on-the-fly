import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { todayDateString } from "@/lib/utils";

export async function applyOrderTip(orderId: string, tipAmount: number) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;
  if (!(await isFeatureEnabled(order.restaurantId, "tip_pooling"))) return;

  await prisma.order.update({
    where: { id: orderId },
    data: { tipAmount: Math.max(0, tipAmount) },
  });
}

export async function applyOrderComp(params: {
  orderId: string;
  discountAmount: number;
  compReason: string;
  actorUserId: string;
  actorName: string;
}) {
  const order = await prisma.order.findUnique({ where: { id: params.orderId } });
  if (!order) throw new Error("Order not found");
  if (!(await isFeatureEnabled(order.restaurantId, "tip_pooling"))) {
    throw new Error("Tip/comp module not enabled");
  }

  return prisma.order.update({
    where: { id: params.orderId },
    data: {
      discountAmount: Math.max(0, params.discountAmount),
      compReason: params.compReason.trim(),
    },
  });
}

export async function computeTipPool(restaurantId: string, periodStart: string, periodEnd: string) {
  const start = new Date(`${periodStart}T00:00:00.000`);
  const end = new Date(`${periodEnd}T23:59:59.999`);

  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      paidAt: { gte: start, lte: end },
      tipAmount: { gt: 0 },
    },
    select: {
      tipAmount: true,
      paidByUserId: true,
      paidByName: true,
    },
  });

  const totalTips = orders.reduce((s, o) => s + o.tipAmount, 0);
  if (totalTips <= 0) {
    return { totalTips: 0, splits: [] as Array<{ userId: string | null; name: string; amount: number }> };
  }

  const byCollector = new Map<string, { userId: string | null; name: string; amount: number }>();
  for (const o of orders) {
    const key = o.paidByUserId ?? o.paidByName ?? "unknown";
    const cur = byCollector.get(key) ?? {
      userId: o.paidByUserId,
      name: o.paidByName ?? "Staff",
      amount: 0,
    };
    cur.amount += o.tipAmount;
    byCollector.set(key, cur);
  }

  const splits = Array.from(byCollector.values()).map((s) => ({
    ...s,
    amount: Math.round(s.amount * 100) / 100,
  }));

  return { totalTips: Math.round(totalTips * 100) / 100, splits };
}

export async function exportTipPoolPayout(params: {
  restaurantId: string;
  periodStart: string;
  periodEnd: string;
  createdByName?: string;
}) {
  const pool = await computeTipPool(params.restaurantId, params.periodStart, params.periodEnd);

  const staffCount = await prisma.user.count({ where: { restaurantId: params.restaurantId } });
  const evenShare =
    staffCount > 0 ? Math.round((pool.totalTips / staffCount) * 100) / 100 : 0;

  const exportData = {
    mode: "collected_by_staff",
    evenSharePerStaff: evenShare,
    staffCount,
    ...pool,
  };

  const row = await prisma.tipPoolPayout.create({
    data: {
      restaurantId: params.restaurantId,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      totalTips: pool.totalTips,
      exportData: JSON.stringify(exportData),
      createdByName: params.createdByName,
    },
  });

  return { payout: row, exportData };
}

export async function listTipPayouts(restaurantId: string) {
  return prisma.tipPoolPayout.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export function defaultTipPeriod() {
  const end = todayDateString();
  const d = new Date();
  d.setDate(d.getDate() - 6);
  const start = d.toISOString().slice(0, 10);
  return { start, end };
}

import { prisma } from "@/lib/prisma";
import { sumOrderRevenue, todayDateString } from "@/lib/utils";
import type { ReconciliationStatus } from "@/generated/prisma/client";

export async function runDailyReconciliation(restaurantId: string, date?: string) {
  const periodDate = date ?? todayDateString();
  const tenantId =
    (await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { tenantId: true } }))
      ?.tenantId ?? null;

  const orders = await prisma.order.findMany({
    where: { restaurantId, date: periodDate, status: { not: "CANCELLED" } },
    include: { items: true, payments: true },
  });

  let expectedTotal = 0;
  for (const order of orders) {
    expectedTotal += sumOrderRevenue(order.items) - (order.discountAmount ?? 0);
  }

  const payments = await prisma.payment.findMany({
    where: {
      restaurantId,
      createdAt: {
        gte: new Date(`${periodDate}T00:00:00`),
        lt: new Date(`${periodDate}T23:59:59.999`),
      },
    },
  });
  const receivedTotal = payments.reduce((s, p) => s + p.amount, 0);

  const variance = Math.round((receivedTotal - expectedTotal) * 100) / 100;
  let status: ReconciliationStatus = "BALANCED";
  if (Math.abs(variance) > 0.01) status = variance > 0 ? "VARIANCE" : "VARIANCE";
  if (orders.length === 0 && payments.length === 0) status = "OPEN";

  const details = JSON.stringify({
    orderCount: orders.length,
    paymentCount: payments.length,
    paidOrders: orders.filter((o) => o.paidAt).length,
  });

  return prisma.paymentReconciliation.upsert({
    where: { restaurantId_periodDate: { restaurantId, periodDate } },
    create: {
      restaurantId,
      tenantId,
      periodDate,
      expectedTotal,
      receivedTotal,
      variance,
      status,
      details,
    },
    update: {
      expectedTotal,
      receivedTotal,
      variance,
      status,
      details,
      tenantId,
    },
  });
}

export async function listReconciliations(restaurantId: string, limit = 30) {
  return prisma.paymentReconciliation.findMany({
    where: { restaurantId },
    orderBy: { periodDate: "desc" },
    take: limit,
  });
}

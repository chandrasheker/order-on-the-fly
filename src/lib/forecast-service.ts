import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { todayDateString } from "@/lib/utils";

export async function generateDemandForecasts(restaurantId: string, horizonDays = 7) {
  const today = todayDateString();
  const lookbackDays = 28;
  const start = new Date();
  start.setDate(start.getDate() - lookbackDays);

  const items = await prisma.orderItem.findMany({
    where: {
      order: {
        restaurantId,
        createdAt: { gte: start },
        status: { not: "CANCELLED" },
      },
    },
    select: {
      menuItemId: true,
      itemName: true,
      quantity: true,
      order: { select: { date: true } },
    },
  });

  const byItemDay = new Map<string, Map<string, number>>();
  const names = new Map<string, string>();

  for (const row of items) {
    names.set(row.menuItemId, row.itemName);
    const dayMap = byItemDay.get(row.menuItemId) ?? new Map<string, number>();
    dayMap.set(row.order.date, (dayMap.get(row.order.date) ?? 0) + row.quantity);
    byItemDay.set(row.menuItemId, dayMap);
  }

  const forecasts: Array<{
    menuItemId: string;
    menuItemName: string;
    date: string;
    predictedQuantity: number;
    confidence: number;
  }> = [];

  for (const [menuItemId, dayMap] of byItemDay) {
    const dailyTotals = [...dayMap.values()];
    if (!dailyTotals.length) continue;
    const avg = dailyTotals.reduce((a, b) => a + b, 0) / dailyTotals.length;
    const variance =
      dailyTotals.reduce((s, v) => s + (v - avg) ** 2, 0) / dailyTotals.length;
    const confidence = Math.min(0.95, Math.max(0.3, 1 - Math.sqrt(variance) / (avg + 1)));

    for (let d = 0; d < horizonDays; d++) {
      const date = new Date();
      date.setDate(date.getDate() + d);
      const dateStr = date.toISOString().slice(0, 10);
      forecasts.push({
        menuItemId,
        menuItemName: names.get(menuItemId) ?? "Item",
        date: dateStr,
        predictedQuantity: Math.round(avg * 10) / 10,
        confidence,
      });
    }
  }

  for (const f of forecasts) {
    await prisma.demandForecast.upsert({
      where: {
        restaurantId_menuItemId_date: {
          restaurantId,
          menuItemId: f.menuItemId,
          date: f.date,
        },
      },
      create: {
        restaurantId,
        menuItemId: f.menuItemId,
        menuItemName: f.menuItemName,
        date: f.date,
        predictedQuantity: f.predictedQuantity,
        confidence: f.confidence,
        modelVersion: "v1-sma",
      },
      update: {
        predictedQuantity: f.predictedQuantity,
        confidence: f.confidence,
        menuItemName: f.menuItemName,
      },
    });
  }

  return forecasts.length;
}

export async function listForecasts(restaurantId: string, date?: string) {
  const d = date ?? todayDateString();
  return prisma.demandForecast.findMany({
    where: { restaurantId, date: d },
    orderBy: { predictedQuantity: "desc" },
    take: 50,
  });
}

export async function getForecastInsights(restaurantId: string) {
  const today = todayDateString();
  const top = await listForecasts(restaurantId, today);
  const wasteRisk = top.filter((f) => f.predictedQuantity < 2);
  const rushItems = top.filter((f) => f.predictedQuantity >= 10);

  return {
    date: today,
    topDemand: top.slice(0, 10),
    rushItems,
    slowItems: wasteRisk,
    recommendation:
      rushItems.length > 0
        ? `Prep extra ${rushItems.slice(0, 3).map((i) => i.menuItemName).join(", ")} today.`
        : "Demand looks steady — follow standard prep levels.",
  };
}

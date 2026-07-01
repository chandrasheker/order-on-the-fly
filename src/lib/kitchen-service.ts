import { prisma } from "@/lib/prisma";
import { checkOverdueItems } from "@/lib/order-service";
import { todayDateString } from "@/lib/utils";
import { formatOrderLocation } from "@/lib/order-channel";

export const DEFAULT_KITCHEN_STATIONS = [
  {
    name: "Hot Kitchen",
    slug: "hot-kitchen",
    color: "#ef4444",
    categorySlugs: ["biryani-mains", "lunch-specials", "todays-special"],
    sortOrder: 0,
  },
  {
    name: "Grill & Tiffins",
    slug: "grill",
    color: "#f97316",
    categorySlugs: ["tiffins", "snacks"],
    sortOrder: 1,
  },
  {
    name: "Bar",
    slug: "bar",
    color: "#3b82f6",
    categorySlugs: ["beverages", "tea-coffee"],
    sortOrder: 2,
  },
  {
    name: "Cold / Dessert",
    slug: "cold",
    color: "#06b6d4",
    categorySlugs: ["desserts"],
    sortOrder: 3,
  },
] as const;

const STATION_COLORS = ["#ef4444", "#f97316", "#3b82f6", "#06b6d4", "#8b5cf6", "#22c55e", "#eab308"];

export async function syncKitchenStationsFromMenu(restaurantId: string) {
  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId },
    orderBy: { sortOrder: "asc" },
  });

  if (categories.length === 0) {
    await ensureKitchenStations(restaurantId);
    return;
  }

  const categorySlugs = new Set(categories.map((c) => c.slug));
  const existing = await prisma.kitchenStation.findMany({ where: { restaurantId } });

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    await prisma.kitchenStation.upsert({
      where: { restaurantId_slug: { restaurantId, slug: cat.slug } },
      create: {
        restaurantId,
        name: cat.name,
        slug: cat.slug,
        color: STATION_COLORS[i % STATION_COLORS.length],
        categorySlugs: JSON.stringify([cat.slug]),
        sortOrder: cat.sortOrder ?? i,
      },
      update: {
        name: cat.name,
        color: STATION_COLORS[i % STATION_COLORS.length],
        categorySlugs: JSON.stringify([cat.slug]),
        sortOrder: cat.sortOrder ?? i,
      },
    });
  }

  for (const station of existing) {
    if (!categorySlugs.has(station.slug)) {
      await prisma.kitchenStation.delete({ where: { id: station.id } });
    }
  }
}

export function parseCategorySlugs(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
}

export async function ensureKitchenStations(restaurantId: string) {
  const count = await prisma.kitchenStation.count({ where: { restaurantId } });
  if (count > 0) return;

  await prisma.kitchenStation.createMany({
    data: DEFAULT_KITCHEN_STATIONS.map((station) => ({
      restaurantId,
      name: station.name,
      slug: station.slug,
      color: station.color,
      categorySlugs: JSON.stringify(station.categorySlugs),
      sortOrder: station.sortOrder,
    })),
  });
}

export async function getKitchenStations(restaurantId: string) {
  await syncKitchenStationsFromMenu(restaurantId);
  const stations = await prisma.kitchenStation.findMany({
    where: { restaurantId },
    orderBy: { sortOrder: "asc" },
  });
  return stations.map((station) => ({
    ...station,
    categorySlugs: parseCategorySlugs(station.categorySlugs),
  }));
}

export async function getKitchenTickets(restaurantId: string, stationSlug?: string | null) {
  await checkOverdueItems(restaurantId);
  const stations = await getKitchenStations(restaurantId);
  const station =
    stationSlug && stationSlug !== "all"
      ? stations.find((s) => s.slug === stationSlug)
      : null;
  const allowedSlugs = station ? station.categorySlugs : null;

  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      date: todayDateString(),
      status: { notIn: ["SERVED", "CANCELLED"] },
    },
    include: {
      table: { select: { number: true, kind: true, serviceLabel: true } },
      items: {
        include: {
          menuItem: { include: { category: { select: { slug: true, name: true } } } },
        },
        orderBy: { expectedReadyAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const tickets = orders
    .map((order) => {
      const items = order.items.filter((item) => {
        if (item.status === "SERVED" || item.status === "UNAVAILABLE") return false;
        if (!allowedSlugs) return true;
        const slug = item.menuItem.category.slug;
        return allowedSlugs.includes(slug);
      });
      if (items.length === 0) return null;
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        tableNumber: order.table.number,
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
        status: order.status,
        alarmTriggered: order.alarmTriggered,
        createdAt: order.createdAt,
        items: items.map((item) => ({
          id: item.id,
          itemName: item.itemName,
          quantity: item.quantity,
          status: item.status,
          notes: item.notes,
          prepTimeMinutes: item.prepTimeMinutes,
          expectedReadyAt: item.expectedReadyAt,
          isOverdue: item.isOverdue,
          categoryName: item.menuItem.category.name,
          categorySlug: item.menuItem.category.slug,
        })),
      };
    })
    .filter(Boolean);

  return { stations, tickets, activeStation: station?.slug ?? stationSlug ?? "all" };
}

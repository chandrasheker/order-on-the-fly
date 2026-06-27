import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getActiveOrders, getTodayOrders } from "@/lib/order-service";
import { todayDateString } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { logApiRequest, logInfo } from "@/lib/logger";

export async function GET() {
  logApiRequest("staff/dashboard", "GET");
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = todayDateString();

  const [orders, todayOrders, alerts, orderCount] = await Promise.all([
    getActiveOrders(session.restaurantId),
    getTodayOrders(session.restaurantId),
    prisma.alert.findMany({
      where: { restaurantId: session.restaurantId, isRead: false },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.order.count({
      where: { restaurantId: session.restaurantId, date: today },
    }),
  ]);

  const todayRevenue = todayOrders.reduce(
    (sum, o) =>
      sum + o.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
    0
  );

  const overdueCount = orders.reduce(
    (sum, o) => sum + o.items.filter((i) => i.isOverdue && i.status !== "SERVED").length,
    0
  );

  const todayOrdersWithTotal = todayOrders.map((o) => ({
    ...o,
    total: o.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
  }));

  logInfo("api:staff/dashboard", "Dashboard loaded", {
    restaurantId: session.restaurantId,
    activeOrders: orders.length,
    todayOrders: orderCount,
    unreadAlerts: alerts.length,
  });

  return NextResponse.json({
    orders,
    todayOrders: todayOrdersWithTotal,
    alerts,
    stats: {
      activeOrders: orders.length,
      todayOrders: orderCount,
      servedToday: todayOrders.filter((o) => o.status === "SERVED").length,
      revenue: todayRevenue,
      overdueCount,
      unreadAlerts: alerts.length,
    },
  });
}

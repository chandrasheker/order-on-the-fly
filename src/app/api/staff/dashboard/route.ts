import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getActiveOrders } from "@/lib/order-service";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [orders, alerts, stats] = await Promise.all([
    getActiveOrders(session.restaurantId),
    prisma.alert.findMany({
      where: { restaurantId: session.restaurantId, isRead: false },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.order.aggregate({
      where: {
        restaurantId: session.restaurantId,
        date: new Date().toISOString().split("T")[0],
      },
      _count: true,
      _sum: { orderNumber: true },
    }),
  ]);

  const todayRevenue = await prisma.orderItem.findMany({
    where: {
      order: {
        restaurantId: session.restaurantId,
        date: new Date().toISOString().split("T")[0],
      },
    },
    select: { unitPrice: true, quantity: true },
  });

  const revenue = todayRevenue.reduce(
    (sum, i) => sum + i.unitPrice * i.quantity,
    0
  );

  const overdueCount = orders.reduce(
    (sum, o) => sum + o.items.filter((i) => i.isOverdue && i.status !== "SERVED").length,
    0
  );

  return NextResponse.json({
    orders,
    alerts,
    stats: {
      activeOrders: orders.length,
      todayOrders: stats._count,
      revenue,
      overdueCount,
      unreadAlerts: alerts.length,
    },
  });
}

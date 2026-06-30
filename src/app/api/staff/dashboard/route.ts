import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  getActiveOrders,
  getPendingPaymentOrders,
  getCompletedOrders,
  getMissedTimelineItems,
} from "@/lib/order-service";
import { todayDateString, sumOrderRevenue, sumPaidOrderRevenue } from "@/lib/utils";
import { getTabsForRole } from "@/lib/staff-permissions";
import { prisma } from "@/lib/prisma";
import { logApiRequest, logInfo } from "@/lib/logger";
import { getOrderPaymentSummary } from "@/lib/payment-allocation-service";

export async function GET() {
  logApiRequest("staff/dashboard", "GET");
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = todayDateString();

  const [orders, pendingOrders, completedOrders, alerts, orderCount, missedData, tableSwitchRequests] =
    await Promise.all([
      getActiveOrders(session.restaurantId),
      getPendingPaymentOrders(session.restaurantId),
      getCompletedOrders(session.restaurantId),
      prisma.alert.findMany({
        where: { restaurantId: session.restaurantId, isRead: false },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.order.count({
        where: { restaurantId: session.restaurantId, date: today },
      }),
      getMissedTimelineItems(session.restaurantId),
      prisma.tableSwitchRequest.findMany({
        where: { restaurantId: session.restaurantId, status: "PENDING" },
        orderBy: { requestedAt: "asc" },
        take: 20,
      }),
    ]);

  const todayRevenue = completedOrders.reduce(
    (sum, o) => sum + sumPaidOrderRevenue(o, o.items),
    0
  );

  const overdueCount = orders.reduce(
    (sum, o) =>
      sum +
      o.items.filter(
        (i) => i.isOverdue && i.status !== "SERVED" && i.status !== "UNAVAILABLE"
      ).length,
    0
  );

  const withTotal = <T extends { id: string; items: Array<{ unitPrice: number; quantity: number; status: string }>; paidAt?: Date | null }>(
    list: T[]
  ) =>
    list.map((o) => ({
      ...o,
      total: sumOrderRevenue(o.items),
      paidTotal: sumPaidOrderRevenue(o, o.items),
    }));

  const pendingWithPayments = (
    await Promise.all(
      withTotal(pendingOrders).map(async (order) => ({
        ...order,
        paymentSummary: await getOrderPaymentSummary(order.id),
      })),
    )
  ).filter((order) => (order.paymentSummary?.remaining ?? order.total ?? 0) > 0);

  logInfo("api:staff/dashboard", "Dashboard loaded", {
    restaurantId: session.restaurantId,
    activeOrders: orders.length,
    pendingPayments: pendingOrders.length,
    completedOrders: completedOrders.length,
    unreadAlerts: alerts.length,
  });

  return NextResponse.json({
    orders,
    pendingOrders: pendingWithPayments,
    completedOrders: withTotal(completedOrders),
    alerts,
    permissions: {
      tabs: getTabsForRole(session.role),
      role: session.role,
    },
    missedTimeline: missedData.items.map((item) => ({
      id: item.id,
      itemName: item.itemName,
      quantity: item.quantity,
      prepTimeMinutes: item.prepTimeMinutes,
      expectedReadyAt: item.expectedReadyAt,
      servedAt: item.servedAt,
      minutesLate: item.minutesLate,
      status: item.status,
      orderId: item.orderId,
      orderNumber: item.order.orderNumber,
      tableNumber: item.order.table.number,
      menuItemId: item.menuItem?.id,
      currentPrepTime: item.menuItem?.prepTimeMinutes,
    })),
    missedSummary: missedData.summary,
    tableSwitchRequests,
    stats: {
      activeOrders: orders.length,
      pendingPayments: pendingOrders.length,
      completedOrders: completedOrders.length,
      todayOrders: orderCount,
      revenue: todayRevenue,
      overdueCount,
      missedTimelineCount: missedData.items.length,
      unreadAlerts: alerts.length,
    },
  });
}

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
import { getRestaurantFeatureFlags } from "@/lib/feature-flags";
import { ensureServiceTables } from "@/lib/service-tables";

export async function GET() {
  logApiRequest("staff/dashboard", "GET");
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = todayDateString();
  await ensureServiceTables(session.restaurantId, session.restaurantSlug);
  const features = await getRestaurantFeatureFlags(session.restaurantId);

  const [orders, pendingOrders, completedOrders, alerts, orderCount, missedData, tableSwitchRequests, todayPaymentSum] =
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
      prisma.payment.aggregate({
        where: {
          restaurantId: session.restaurantId,
          createdAt: { gte: new Date(`${today}T00:00:00.000`) },
        },
        _sum: { amount: true },
      }),
    ]);

  const todayRevenue = todayPaymentSum._sum.amount ?? 0;

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
        paymentSummary: features.split_bill
          ? await getOrderPaymentSummary(order.id)
          : null,
      })),
    )
  ).filter((order) => {
    if (features.split_bill) {
      return (order.paymentSummary?.remaining ?? order.total ?? 0) > 0;
    }
    return !order.paidAt;
  });

  const roleTabs = getTabsForRole(session.role).filter((tab) => {
    if (tab === "offline" && !features.phone_orders) return false;
    return true;
  });

  logInfo("api:staff/dashboard", "Dashboard loaded", {
    restaurantId: session.restaurantId,
    activeOrders: orders.length,
    pendingPayments: pendingWithPayments.length,
    completedOrders: completedOrders.length,
    unreadAlerts: alerts.length,
  });

  return NextResponse.json({
    orders,
    pendingOrders: pendingWithPayments,
    completedOrders: withTotal(completedOrders),
    alerts,
    permissions: {
      tabs: roleTabs,
      role: session.role,
    },
    features,
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
      pendingPayments: pendingWithPayments.length,
      completedOrders: completedOrders.length,
      todayOrders: orderCount,
      revenue: todayRevenue,
      overdueCount,
      missedTimelineCount: missedData.items.length,
      unreadAlerts: alerts.length,
    },
  });
}

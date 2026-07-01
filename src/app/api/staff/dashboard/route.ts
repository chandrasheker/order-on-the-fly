import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  getActiveOrders,
  getPendingPaymentOrders,
  getCompletedOrders,
  getMissedTimelineItems,
  checkOverdueItems,
} from "@/lib/order-service";
import { todayDateString, sumOrderRevenue, sumPaidOrderRevenue } from "@/lib/utils";
import { getTabsForRole } from "@/lib/staff-permissions";
import { prisma } from "@/lib/prisma";
import { logApiRequest, logInfo } from "@/lib/logger";
import { getOrderPaymentSummaries, finalizeOrderIfSettled } from "@/lib/payment-allocation-service";
import { getRestaurantFeatureFlags } from "@/lib/feature-flags";
import { ensureServiceTables } from "@/lib/service-tables";

export async function GET() {
  logApiRequest("staff/dashboard", "GET");
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.restaurantId },
      select: { id: true, slug: true, name: true, logoUrl: true },
    });
    if (!restaurant) {
      return NextResponse.json(
        { error: "Session expired. Please sign in again.", code: "RESTAURANT_NOT_FOUND" },
        { status: 401 },
      );
    }

    const today = todayDateString();
    const features = await getRestaurantFeatureFlags(session.restaurantId);

    if (session.role === "COOK") {
      return NextResponse.json({
        orders: [],
        pendingOrders: [],
        completedOrders: [],
        alerts: [],
        permissions: { tabs: [], role: session.role },
        features,
        restaurant: {
          name: restaurant.name,
          logoUrl: restaurant.logoUrl,
        },
        missedTimeline: [],
        missedSummary: [],
        tableSwitchRequests: [],
        stats: {
          activeOrders: 0,
          pendingPayments: 0,
          pendingPaymentsAmount: 0,
          completedOrders: 0,
          todayOrders: 0,
          revenue: 0,
          overdueCount: 0,
          missedTimelineCount: 0,
          unreadAlerts: 0,
        },
      });
    }

    try {
      await ensureServiceTables(session.restaurantId, session.restaurantSlug);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Setup failed";
      if (message.includes("Restaurant not found")) {
        return NextResponse.json(
          { error: "Session expired. Please sign in again.", code: "RESTAURANT_NOT_FOUND" },
          { status: 401 },
        );
      }
      throw error;
    }
  if (features.aggregator_inbox) {
    const { ensureAggregatorConnectionRows } = await import("@/lib/aggregator-connection-service");
    await ensureAggregatorConnectionRows(session.restaurantId);
  }

  await checkOverdueItems(session.restaurantId);

  const skipOverdue = { skipOverdueCheck: true as const };

  const [orders, pendingOrders, completedOrders, alerts, orderCount, missedData, tableSwitchRequests, todayPaymentSum] =
    await Promise.all([
      getActiveOrders(session.restaurantId, skipOverdue),
      getPendingPaymentOrders(session.restaurantId),
      getCompletedOrders(session.restaurantId),
      prisma.alert.findMany({
        where: {
          restaurantId: session.restaurantId,
          isRead: false,
          type: { not: "NEW_KITCHEN_ITEM" },
          OR: [{ targetUserId: null }, { targetUserId: session.id }],
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.order.count({
        where: { restaurantId: session.restaurantId, date: today },
      }),
      getMissedTimelineItems(session.restaurantId, skipOverdue),
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

  const pendingWithTotals = withTotal(pendingOrders);
  type PendingWithPayment = (typeof pendingWithTotals)[number] & {
    paymentSummary: Awaited<ReturnType<typeof getOrderPaymentSummaries>> extends Map<string, infer S>
      ? S | null
      : null;
  };
  let pendingWithPayments: PendingWithPayment[] = pendingWithTotals as PendingWithPayment[];

  if (pendingWithTotals.length > 0) {
    const summaries = await getOrderPaymentSummaries(pendingWithTotals.map((o) => o.id));
    pendingWithPayments = [];
    for (const order of pendingWithTotals) {
      const paymentSummary = summaries.get(order.id) ?? null;
      const remaining = paymentSummary?.remaining ?? order.total ?? 0;
      if (remaining <= 0.01) {
        if (!order.paidAt) {
          void finalizeOrderIfSettled(order.id);
        }
        continue;
      }
      pendingWithPayments.push({
        ...order,
        paymentSummary,
      });
    }
  }

  type PendingOrder = PendingWithPayment & {
    paymentSummary?: { remaining: number } | null;
  };

  const pendingPaymentsAmount = pendingWithPayments.reduce(
    (sum, order) => sum + ((order as PendingOrder).paymentSummary?.remaining ?? order.total ?? 0),
    0,
  );

  const roleTabs = getTabsForRole(session.role).filter((tab) => {
    if (tab === "offline" && !features.phone_orders) return false;
    return true;
  });

  if (process.env.DEBUG === "1") {
    logInfo("api:staff/dashboard", "Dashboard loaded", {
      restaurantId: session.restaurantId,
      activeOrders: orders.length,
      pendingPayments: pendingWithPayments.length,
    });
  }

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
      pendingPaymentsAmount,
      completedOrders: completedOrders.length,
      todayOrders: orderCount,
      revenue: todayRevenue,
      overdueCount,
      missedTimelineCount: missedData.items.length,
      unreadAlerts: alerts.length,
    },
  });
  } catch (error) {
    console.error("staff/dashboard failed:", error);
    return NextResponse.json(
      { error: "Dashboard temporarily unavailable", code: "DASHBOARD_ERROR" },
      { status: 503 },
    );
  }
}

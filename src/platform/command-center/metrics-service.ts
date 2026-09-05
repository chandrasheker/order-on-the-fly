import { prisma } from "@/lib/prisma";
import { financialsForOrder, isCapturedPayment } from "@/lib/order-financials";
import { addPaise, toPaise } from "@/lib/money";
import { PRINT_AGENT_ONLINE_MS, PRINT_ERROR, printDeliveryMode } from "@/lib/print-constants";
import { ACTIVE_GATEWAY_ATTEMPT_STATUSES, GATEWAY_ATTEMPT_STATUS, GATEWAY_REFUND_STATUS } from "@/lib/gateway-constants";
import { getActiveStaffSessionsByRestaurants } from "@/lib/staff-session-service";
import {
  attentionReasons,
  classifyKitchenLoad,
  classifyMoneyHealth,
  classifyPrintingHealth,
  classifyReliability,
  classifyServiceLoad,
  slaLabel,
} from "@/platform/command-center/classify";
import { durationStats, formatInrFromPaise } from "@/platform/command-center/format";
import { ledgerRevenueFromPayments } from "@/platform/command-center/money-metrics";
import { loadReliabilityByRestaurant, serializeReliability } from "@/platform/command-center/reliability-service";
import { trendPercent, type ResolvedTimeRange } from "@/platform/command-center/time-range";
import type {
  CommandCenterPayload,
  RankingRow,
  RestaurantCommandRow,
} from "@/platform/command-center/types";

const OPEN_ORDER = ["PENDING", "PREPARING", "READY"] as const;
const KITCHEN_OPEN_ITEM = ["PENDING", "PREPARING", "READY"] as const;

function hrefs(tenantId: string, restaurantId: string) {
  const base = `/platform/tenants/${tenantId}/restaurants/${restaurantId}`;
  const tenantLogs = `/platform/tenants/${tenantId}`;
  return {
    overview: base,
    operations: `${base}?tab=operations`,
    sla: `${base}?tab=operations&focus=sla`,
    financial: `${base}?tab=financial`,
    staff: `${base}?tab=staff`,
    logs: `${base}?tab=logs`,
    errors: `${base}?tab=logs&preset=errors`,
    paymentsFailed: `${base}?tab=logs&preset=payments&failedOnly=1`,
    printingAmbiguous: `${base}?tab=logs&preset=printing&ambiguousOnly=1`,
    security: `${tenantLogs}?tab=logs&preset=security`,
  };
}

function emptyStaff() {
  return {
    userId: "",
    name: "",
    role: "",
    ordersPlaced: 0,
    itemsPrepared: 0,
    itemsReady: 0,
    itemsServed: 0,
    ordersServed: 0,
    tablesServed: [] as number[],
    paymentsCollected: 0,
    revenueCollectedPaise: 0,
  };
}

type StaffAcc = ReturnType<typeof emptyStaff>;

function bumpStaff(map: Map<string, StaffAcc>, userId: string, name: string, role: string) {
  if (!map.has(userId)) {
    map.set(userId, { ...emptyStaff(), userId, name, role, tablesServed: [] });
  }
  return map.get(userId)!;
}

function hourHistogram(dates: Date[]) {
  const hours = new Array(24).fill(0);
  for (const date of dates) hours[date.getHours()] += 1;
  let busiest: number | null = null;
  let max = 0;
  hours.forEach((count, hour) => {
    if (count > max) {
      max = count;
      busiest = hour;
    }
  });
  return { busiestHour: max > 0 ? busiest : null };
}

export async function getCommandCenter(params: {
  range: ResolvedTimeRange;
  tenantId?: string;
  restaurantId?: string;
}): Promise<CommandCenterPayload> {
  const range = params.range;
  const restaurantWhere = params.restaurantId
    ? { id: params.restaurantId, tenantId: params.tenantId }
    : params.tenantId
      ? { tenantId: params.tenantId }
      : {};

  const restaurants = await prisma.restaurant.findMany({
    where: restaurantWhere,
    select: {
      id: true,
      name: true,
      slug: true,
      isEnabled: true,
      kitchenPaused: true,
      kitchenAutoPauseOverdueThreshold: true,
      tenantId: true,
      tenant: { select: { id: true, name: true, slug: true, isEnabled: true } },
    },
    orderBy: { name: "asc" },
  });

  if (params.restaurantId && restaurants.length === 0) {
    const err = new Error("Restaurant not found in tenant");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  if (params.tenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: params.tenantId },
      select: { id: true, name: true, slug: true, isEnabled: true },
    });
    if (!tenant) {
      const err = new Error("Tenant not found");
      (err as Error & { status?: number }).status = 404;
      throw err;
    }
  }

  const ids = restaurants.map((row) => row.id);
  const now = new Date();

  const [
    periodOrders,
    previousOrders,
    openItems,
    periodPayments,
    previousPayments,
    unpaidOrders,
    periodGuests,
    openGuests,
    periodPrints,
    printQueue,
    agents,
    currentGatewayAttempts,
    periodGatewayAttempts,
    currentRefundAttempts,
    periodRefundAttempts,
    reconciliations,
    tables,
    sessionsByRestaurant,
    reliabilityByRestaurant,
  ] = await Promise.all([
    ids.length
      ? prisma.order.findMany({
          where: { restaurantId: { in: ids }, date: { gte: range.fromDate, lte: range.toDate } },
          include: {
            items: true,
            payments: true,
            table: { select: { id: true, number: true, assignedServerId: true } },
          },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.order.findMany({
          where: {
            restaurantId: { in: ids },
            date: { gte: range.previousFromDate, lte: range.previousToDate },
          },
          include: { items: true, payments: true },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.orderItem.findMany({
          where: {
            status: { in: [...KITCHEN_OPEN_ITEM] },
            order: { restaurantId: { in: ids }, status: { not: "CANCELLED" } },
          },
          include: {
            order: { select: { restaurantId: true, tableId: true, status: true, createdAt: true } },
          },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.payment.findMany({
          where: { restaurantId: { in: ids }, createdAt: { gte: range.from, lte: range.to } },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.payment.findMany({
          where: { restaurantId: { in: ids }, createdAt: { gte: range.previousFrom, lte: range.previousTo } },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.order.findMany({
          where: { restaurantId: { in: ids }, status: { not: "CANCELLED" }, paidAt: null },
          include: { items: true, payments: true },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.guestServiceRequest.findMany({
          where: { restaurantId: { in: ids }, createdAt: { gte: range.from, lte: range.to } },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.guestServiceRequest.findMany({
          where: { restaurantId: { in: ids }, status: { in: ["PENDING", "ACKNOWLEDGED"] } },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.printJob.findMany({
          where: { restaurantId: { in: ids }, createdAt: { gte: range.from, lte: range.to } },
          select: {
            restaurantId: true,
            status: true,
            attempts: true,
            reprintOfPrintJobId: true,
            lastErrorCode: true,
            lastError: true,
          },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.printJob.findMany({
          where: { restaurantId: { in: ids }, status: { in: ["PENDING", "SENT"] } },
          select: { restaurantId: true, status: true },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.printerAgent.findMany({
          where: { restaurantId: { in: ids } },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.gatewayPaymentAttempt.findMany({
          where: {
            restaurantId: { in: ids },
            status: { in: [...ACTIVE_GATEWAY_ATTEMPT_STATUSES] },
          },
          select: { restaurantId: true, status: true },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.gatewayPaymentAttempt.findMany({
          where: {
            restaurantId: { in: ids },
            createdAt: { gte: range.from, lte: range.to },
            status: GATEWAY_ATTEMPT_STATUS.FAILED,
          },
          select: { restaurantId: true, status: true },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.gatewayRefundAttempt.findMany({
          where: { restaurantId: { in: ids }, status: GATEWAY_REFUND_STATUS.PENDING },
          select: { restaurantId: true, status: true },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.gatewayRefundAttempt.findMany({
          where: {
            restaurantId: { in: ids },
            createdAt: { gte: range.from, lte: range.to },
            status: GATEWAY_REFUND_STATUS.FAILED,
          },
          select: { restaurantId: true, status: true },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.paymentReconciliation.findMany({
          where: { restaurantId: { in: ids } },
          orderBy: { periodDate: "desc" },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.table.findMany({
          where: { restaurantId: { in: ids }, isActive: true },
          select: {
            id: true,
            restaurantId: true,
            number: true,
            assignedServerId: true,
            assignedServer: { select: { id: true, name: true, role: true } },
          },
        })
      : Promise.resolve([]),
    getActiveStaffSessionsByRestaurants(ids),
    loadReliabilityByRestaurant({ restaurantIds: ids, from: range.from, to: range.to }),
  ]);

  const latestRecon = new Map<string, (typeof reconciliations)[number]>();
  for (const row of reconciliations) {
    if (!latestRecon.has(row.restaurantId)) latestRecon.set(row.restaurantId, row);
  }

  const rows: RestaurantCommandRow[] = restaurants.map((restaurant) => {
    const tenantId = restaurant.tenantId ?? restaurant.tenant?.id ?? "";
    const tenantName = restaurant.tenant?.name ?? "Unknown tenant";
    const tenantEnabled = restaurant.tenant?.isEnabled ?? true;
    const orders = periodOrders.filter((order) => order.restaurantId === restaurant.id);
    const prevOrders = previousOrders.filter((order) => order.restaurantId === restaurant.id);
    const liveItems = openItems.filter((item) => item.order.restaurantId === restaurant.id);
    const payments = periodPayments.filter((payment) => payment.restaurantId === restaurant.id);
    const prevPayments = previousPayments.filter((payment) => payment.restaurantId === restaurant.id);
    const unpaid = unpaidOrders.filter((order) => order.restaurantId === restaurant.id);
    const guests = periodGuests.filter((row) => row.restaurantId === restaurant.id);
    const liveGuests = openGuests.filter((row) => row.restaurantId === restaurant.id);
    const prints = periodPrints.filter((row) => row.restaurantId === restaurant.id);
    const queue = printQueue.filter((row) => row.restaurantId === restaurant.id);
    const restaurantAgents = agents.filter((row) => row.restaurantId === restaurant.id);
    const currentAttempts = currentGatewayAttempts.filter((row) => row.restaurantId === restaurant.id);
    const periodFailedAttempts = periodGatewayAttempts.filter((row) => row.restaurantId === restaurant.id);
    const currentRefunds = currentRefundAttempts.filter((row) => row.restaurantId === restaurant.id);
    const periodFailedRefunds = periodRefundAttempts.filter((row) => row.restaurantId === restaurant.id);
    const restaurantTables = tables.filter((row) => row.restaurantId === restaurant.id);
    const sessions = sessionsByRestaurant.get(restaurant.id) ?? [];
    const reliability = reliabilityByRestaurant.get(restaurant.id);

    const nonCancelled = orders.filter((order) => order.status !== "CANCELLED");
    const servedOrders = nonCancelled.filter((order) => order.status === "SERVED");
    const openOrders = nonCancelled.filter((order) => (OPEN_ORDER as readonly string[]).includes(order.status));
    const itemsOrdered = nonCancelled.reduce(
      (sum, order) => sum + order.items.filter((item) => item.status !== "UNAVAILABLE").reduce((n, item) => n + item.quantity, 0),
      0,
    );
    const revenue = ledgerRevenueFromPayments(payments);
    const prevRevenue = ledgerRevenueFromPayments(prevPayments);
    const outstandingPaise = unpaid.reduce((sum, order) => {
      const finances = financialsForOrder({
        items: order.items,
        discountAmount: order.discountAmount,
        payments: order.payments,
      });
      return addPaise(sum, finances.amountDuePaise);
    }, 0);

    const pendingItems = liveItems.filter((item) => item.status === "PENDING");
    const preparingItems = liveItems.filter((item) => item.status === "PREPARING");
    const readyItems = liveItems.filter((item) => item.status === "READY");
    const overdueItems = liveItems.filter(
      (item) => item.isOverdue && (item.status === "PENDING" || item.status === "PREPARING"),
    );
    const backlog = pendingItems.length + preparingItems.length;
    let oldestOverdueMs: number | null = null;
    for (const item of overdueItems) {
      const age = now.getTime() - item.expectedReadyAt.getTime();
      if (oldestOverdueMs == null || age > oldestOverdueMs) oldestOverdueMs = age;
    }

    const eligible = nonCancelled
      .flatMap((order) => order.items)
      .filter((item) => item.status === "SERVED" && item.servedAt && item.expectedReadyAt);
    const lateMinutes: number[] = [];
    const prepMinutes: number[] = [];
    let onTime = 0;
    let missed = 0;
    for (const item of eligible) {
      const servedAt = item.servedAt!;
      const expected = item.expectedReadyAt;
      const late = servedAt.getTime() > expected.getTime() || item.missedTimeline;
      if (late) {
        missed += 1;
        lateMinutes.push(Math.max(0, (servedAt.getTime() - expected.getTime()) / 60_000));
      } else {
        onTime += 1;
      }
      if (item.prepTimeMinutes > 0) {
        const plannedStart = expected.getTime() - item.prepTimeMinutes * 60_000;
        prepMinutes.push((servedAt.getTime() - plannedStart) / 60_000);
      }
    }
    const slaSample = eligible.length;
    const onTimePercent = slaSample > 0 ? (onTime / slaSample) * 100 : null;
    const sla = slaLabel({ missedCount: missed, sampleCount: slaSample, onTimePercent });

    const orderServeMs = servedOrders
      .map((order) => {
        const servedAtTimes = order.items.filter((item) => item.servedAt).map((item) => item.servedAt!.getTime());
        if (!servedAtTimes.length) return null;
        return Math.max(...servedAtTimes) - order.createdAt.getTime();
      })
      .filter((value): value is number => value != null && value >= 0);

    const ackMs = guests
      .filter((row) => row.acknowledgedAt)
      .map((row) => row.acknowledgedAt!.getTime() - row.createdAt.getTime())
      .filter((value) => value >= 0);
    const resolveMs = guests
      .filter((row) => row.resolvedAt)
      .map((row) => row.resolvedAt!.getTime() - row.createdAt.getTime())
      .filter((value) => value >= 0);
    let oldestPendingMs: number | null = null;
    for (const row of liveGuests.filter((guest) => guest.status === "PENDING")) {
      const age = now.getTime() - row.createdAt.getTime();
      if (oldestPendingMs == null || age > oldestPendingMs) oldestPendingMs = age;
    }

    const activeTableIds = new Set(openOrders.map((order) => order.tableId));
    const readyByTable = new Map<string, number>();
    for (const item of readyItems) {
      readyByTable.set(item.order.tableId, (readyByTable.get(item.order.tableId) ?? 0) + 1);
    }
    const pendingByTable = new Map<string, number>();
    for (const row of liveGuests) {
      pendingByTable.set(row.tableId, (pendingByTable.get(row.tableId) ?? 0) + 1);
    }

    const serverSessions = sessions.filter((session) => session.role === "SERVER");
    const kitchen = classifyKitchenLoad({
      kitchenPaused: restaurant.kitchenPaused,
      overdueCount: overdueItems.length,
      backlogCount: backlog,
      oldestOverdueMs,
    });
    const service = classifyServiceLoad({
      readyWaiting: readyItems.length,
      unresolvedRequests: liveGuests.length,
      activeTables: activeTableIds.size,
      serverSessions: serverSessions.length,
      avgAckMs: ackMs.length ? ackMs.reduce((a, b) => a + b, 0) / ackMs.length : null,
    });

    const pendingGateway = currentAttempts.length;
    const failedGateway = periodFailedAttempts.length;
    const refundPending = currentRefunds.length;
    const refundFailures = periodFailedRefunds.length;
    const recon = latestRecon.get(restaurant.id);
    const reconciliationVariancePaise = recon ? toPaise(recon.variance) : null;
    const cashVariancePaise = recon?.cashVariance != null ? toPaise(recon.cashVariance) : null;
    const paymentsHealth = classifyMoneyHealth({
      pendingGatewayAttempts: pendingGateway,
      failedGatewayAttempts: failedGateway,
      refundPending,
      refundFailures,
      reconciliationVariancePaise,
      cashVariancePaise,
    });

    const enabledAgents = restaurantAgents.filter((agent) => agent.enabled && !agent.revokedAt);
    const lastSeen = enabledAgents.reduce<Date | null>((latest, agent) => {
      if (!agent.lastSeenAt) return latest;
      if (!latest || agent.lastSeenAt > latest) return agent.lastSeenAt;
      return latest;
    }, null);
    const lastSeenAgoMs = lastSeen ? now.getTime() - lastSeen.getTime() : null;
    const onlineAgents = enabledAgents.filter(
      (agent) => agent.lastSeenAt && now.getTime() - agent.lastSeenAt.getTime() < PRINT_AGENT_ONLINE_MS,
    );
    const ambiguous = prints.filter((job) => job.lastErrorCode === PRINT_ERROR.AMBIGUOUS_DELIVERY).length;
    const failures = prints.filter(
      (job) => job.status === "FAILED" && job.lastErrorCode !== PRINT_ERROR.AMBIGUOUS_DELIVERY,
    ).length;
    const printing = classifyPrintingHealth({
      enabledAgentCount: enabledAgents.length,
      onlineAgentCount: onlineAgents.length,
      lastSeenAt: lastSeen?.toISOString() ?? null,
      lastSeenAgoMs,
      failures,
      ambiguous,
      queueDepth: queue.length,
      lastError: enabledAgents.find((agent) => agent.lastError)?.lastError ?? null,
      deliveryMode: printDeliveryMode(),
    });

    const reliabilitySerialized = serializeReliability(
      reliability ?? {
        requestFailed: 0,
        http5xx: 0,
        failedRequests: 0,
        uniqueFingerprints: new Set(),
        jobFailures: 0,
        providerFailures: 0,
        printFailures: 0,
        securityDenials: 0,
        failedAuth: 0,
        permissionDenied: 0,
        crossRestaurant: 0,
        invalidPrinterAuth: 0,
        razorpaySignature: 0,
        otherSecurity: 0,
        top: new Map(),
      },
    );
    const reliabilityHealth = classifyReliability(reliabilitySerialized);

    const attention = attentionReasons({
      kitchen,
      service,
      payments: paymentsHealth,
      printing,
      reliability: reliabilityHealth,
    });

    const staffMap = new Map<string, StaffAcc>();
    const servedOrdersByStaff = new Map<string, Set<string>>();
    for (const payment of payments) {
      if (!payment.collectedByUserId || !payment.collectedByName) continue;
      if (!isCapturedPayment(payment)) continue;
      const row = bumpStaff(staffMap, payment.collectedByUserId, payment.collectedByName, "STAFF");
      row.paymentsCollected += 1;
      row.revenueCollectedPaise = addPaise(row.revenueCollectedPaise, toPaise(payment.amount));
    }
    for (const order of nonCancelled) {
      if (order.placedByUserId && order.placedByName) {
        bumpStaff(staffMap, order.placedByUserId, order.placedByName, "STAFF").ordersPlaced += 1;
      }
      for (const item of order.items) {
        if (item.preparedByUserId && item.preparedByName) {
          bumpStaff(staffMap, item.preparedByUserId, item.preparedByName, "STAFF").itemsPrepared += item.quantity;
        }
        if (item.readyByUserId && item.readyByName) {
          bumpStaff(staffMap, item.readyByUserId, item.readyByName, "STAFF").itemsReady += item.quantity;
        }
        if (item.servedByUserId && item.servedByName && item.status === "SERVED") {
          const row = bumpStaff(staffMap, item.servedByUserId, item.servedByName, "STAFF");
          row.itemsServed += item.quantity;
          if (!servedOrdersByStaff.has(item.servedByUserId)) servedOrdersByStaff.set(item.servedByUserId, new Set());
          servedOrdersByStaff.get(item.servedByUserId)!.add(order.id);
          if (!row.tablesServed.includes(order.table.number)) row.tablesServed.push(order.table.number);
        }
      }
    }
    for (const [userId, orderIds] of servedOrdersByStaff) {
      const row = staffMap.get(userId);
      if (row) row.ordersServed = orderIds.size;
    }
    for (const session of sessions) {
      bumpStaff(staffMap, session.user.id, session.user.name, session.role);
    }

    const sessionByUser = new Map(sessions.map((session) => [session.userId, session]));
    const servers = restaurantTables
      .filter((table) => table.assignedServerId)
      .reduce<Map<string, RestaurantCommandRow["service"]["servers"][number]>>((map, table) => {
        const user = table.assignedServer;
        if (!user) return map;
        const current = map.get(user.id) ?? {
          userId: user.id,
          name: user.name,
          role: user.role,
          activeTables: 0,
          readyWaiting: 0,
          pendingRequests: 0,
          avgAckMs: ackMs.length ? ackMs.reduce((a, b) => a + b, 0) / ackMs.length : null,
          hasSession: sessionByUser.has(user.id),
          load: "NORMAL" as const,
          note: table.assignedServerId ? null : "Assignment data is partial",
        };
        if (activeTableIds.has(table.id)) current.activeTables += 1;
        current.readyWaiting += readyByTable.get(table.id) ?? 0;
        current.pendingRequests += pendingByTable.get(table.id) ?? 0;
        const classified = classifyServiceLoad({
          readyWaiting: current.readyWaiting,
          unresolvedRequests: current.pendingRequests,
          activeTables: current.activeTables,
          serverSessions: current.hasSession ? 1 : 0,
          avgAckMs: current.avgAckMs,
        });
        current.load = classified.level;
        map.set(user.id, current);
        return map;
      }, new Map());

    if (servers.size === 0 && (serverSessions.length > 0 || readyItems.length > 0 || liveGuests.length > 0)) {
      for (const session of serverSessions) {
        servers.set(session.user.id, {
          userId: session.user.id,
          name: session.user.name,
          role: session.role,
          activeTables: 0,
          readyWaiting: readyItems.length,
          pendingRequests: liveGuests.length,
          avgAckMs: ackMs.length ? ackMs.reduce((a, b) => a + b, 0) / ackMs.length : null,
          hasSession: true,
          load: service.level,
          note: "Table assignment is incomplete; showing restaurant-level service facts",
        });
      }
    }

    const prevEligible = prevOrders
      .filter((order) => order.status !== "CANCELLED")
      .flatMap((order) => order.items)
      .filter((item) => item.status === "SERVED" && item.servedAt && item.expectedReadyAt);
    const prevMissed = prevEligible.filter(
      (item) => item.missedTimeline || item.servedAt!.getTime() > item.expectedReadyAt.getTime(),
    ).length;
    const prevOnTimePercent = prevEligible.length ? ((prevEligible.length - prevMissed) / prevEligible.length) * 100 : 0;
    const prevServe = prevOrders
      .filter((order) => order.status === "SERVED")
      .map((order) => {
        const times = order.items.filter((item) => item.servedAt).map((item) => item.servedAt!.getTime());
        if (!times.length) return null;
        return Math.max(...times) - order.createdAt.getTime();
      })
      .filter((value): value is number => value != null);
    const prevOverdue = prevOrders
      .filter((order) => order.status !== "CANCELLED")
      .flatMap((order) => order.items)
      .filter((item) => item.isOverdue).length;
    const prevErrors = 0;

    const activeStaff = sessions.length;
    const isActive = restaurant.isEnabled && (activeStaff > 0 || openOrders.length > 0 || backlog > 0);
    const guestRequests = guests.length;
    const activityIndex =
      nonCancelled.length * 4 + itemsOrdered + revenue.paymentCount * 2 + activeTableIds.size * 3 + guestRequests * 2;

    const avgServe = orderServeMs.length ? orderServeMs.reduce((a, b) => a + b, 0) / orderServeMs.length : 0;
    const prevAvgServe = prevServe.length ? prevServe.reduce((a, b) => a + b, 0) / prevServe.length : 0;

    return {
      tenantId,
      tenantName,
      tenantEnabled,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      restaurantSlug: restaurant.slug,
      restaurantEnabled: restaurant.isEnabled,
      status: restaurant.isEnabled ? (isActive ? "active" : "quiet") : "disabled",
      needsAttention: attention.length > 0,
      attention,
      period: {
        orders: nonCancelled.length,
        servedOrders: servedOrders.length,
        openOrders: openOrders.length,
        items: itemsOrdered,
        paymentCount: revenue.paymentCount,
        ordersPerHour: nonCancelled.length / range.hours,
        busiestHour: hourHistogram(nonCancelled.map((order) => order.createdAt)).busiestHour,
        aovPaise: revenue.avgCapturedOrderPaise,
      },
      current: {
        activeTables: activeTableIds.size,
        activeStaff,
        kitchenBacklog: backlog,
        overdue: overdueItems.length,
        readyWaiting: readyItems.length,
        pendingRequests: liveGuests.length,
        kitchenPaused: restaurant.kitchenPaused,
        autoPauseThreshold: restaurant.kitchenAutoPauseOverdueThreshold,
        oldestOverdueMs,
      },
      revenue: {
        ...revenue,
        outstandingPaise,
      },
      kitchen: {
        pending: pendingItems.length,
        preparing: preparingItems.length,
        ready: readyItems.length,
        overdue: overdueItems.length,
        backlog,
        paused: restaurant.kitchenPaused,
        autoPauseThreshold: restaurant.kitchenAutoPauseOverdueThreshold,
        oldestOverdueMs,
        sla: {
          servedEligible: slaSample,
          onTime,
          missed,
          onTimePercent,
          avgMinutesLate: lateMinutes.length ? lateMinutes.reduce((a, b) => a + b, 0) / lateMinutes.length : null,
          p50Late: durationStats(lateMinutes).p50,
          p95Late: durationStats(lateMinutes).p95,
          worstLateMinutes: lateMinutes.length ? Math.max(...lateMinutes) : null,
          avgPrepMinutes: prepMinutes.length ? prepMinutes.reduce((a, b) => a + b, 0) / prepMinutes.length : null,
          label: sla.text,
          neverMissed: sla.neverMissed,
        },
        load: kitchen,
      },
      service: {
        orderToServed: durationStats(orderServeMs),
        readyWaiting: readyItems.length,
        tablesServed: new Set(
          servedOrders.map((order) => order.tableId),
        ).size,
        ordersServed: servedOrders.length,
        guestAck: durationStats(ackMs),
        guestResolve: durationStats(resolveMs),
        unresolvedRequests: liveGuests.length,
        oldestPendingMs,
        load: service,
        servers: [...servers.values()],
      },
      guest: {
        waiterCalls: guests.filter((row) => row.type === "CALL_WAITER").length,
        billRequests: guests.filter((row) => row.type === "REQUEST_BILL").length,
        waterOrRefill: guests.filter((row) => row.type === "WATER" || row.type === "REFILL").length,
        unresolved: liveGuests.length,
        acknowledged: guests.filter((row) => row.acknowledgedAt).length,
        avgAckMs: ackMs.length ? ackMs.reduce((a, b) => a + b, 0) / ackMs.length : null,
        avgResolveMs: resolveMs.length ? resolveMs.reduce((a, b) => a + b, 0) / resolveMs.length : null,
        oldestPendingMs,
      },
      money: {
        capturedGrossPaise: revenue.capturedGrossPaise,
        refundsPaise: revenue.refundsPaise,
        netCapturedPaise: revenue.netCapturedPaise,
        outstandingPaise,
        pendingGatewayAttempts: pendingGateway,
        failedGatewayAttempts: failedGateway,
        refundPending,
        refundFailures,
        reconciliationVariancePaise,
        cashVariancePaise,
        health: paymentsHealth,
      },
      printing: {
        jobs: prints.length,
        acked: prints.filter((job) => job.status === "ACKED").length,
        firstAttemptSuccess: prints.filter(
          (job) => job.status === "ACKED" && job.attempts === 1 && !job.reprintOfPrintJobId,
        ).length,
        retries: prints.filter((job) => job.attempts > 1).length,
        failures,
        ambiguous,
        reprints: prints.filter((job) => job.reprintOfPrintJobId).length,
        queueDepth: queue.length,
        lastSeenAt: lastSeen?.toISOString() ?? null,
        lastSeenAgoMs,
        lastError: enabledAgents.find((agent) => agent.lastError)?.lastError ?? null,
        health: printing,
      },
      reliability: {
        ...reliabilitySerialized,
        health: reliabilityHealth,
      },
      security: {
        failedAuth: reliabilitySerialized.failedAuth,
        permissionDenied: reliabilitySerialized.permissionDenied,
        crossRestaurant: reliabilitySerialized.crossRestaurant,
        invalidPrinterAuth: reliabilitySerialized.invalidPrinterAuth,
        razorpaySignature: reliabilitySerialized.razorpaySignature,
        other: reliabilitySerialized.other,
        total: reliabilitySerialized.totalSecurity,
      },
      staff: {
        activeSessions: activeStaff,
        ordersPlaced: [...staffMap.values()].reduce((sum, row) => sum + row.ordersPlaced, 0),
        itemsPrepared: [...staffMap.values()].reduce((sum, row) => sum + row.itemsPrepared, 0),
        itemsReady: [...staffMap.values()].reduce((sum, row) => sum + row.itemsReady, 0),
        itemsServed: [...staffMap.values()].reduce((sum, row) => sum + row.itemsServed, 0),
        ordersServed: [...staffMap.values()].reduce((sum, row) => sum + row.ordersServed, 0),
        tablesServed: new Set([...staffMap.values()].flatMap((row) => row.tablesServed)).size,
        paymentsCollected: [...staffMap.values()].reduce((sum, row) => sum + row.paymentsCollected, 0),
        revenueCollectedPaise: [...staffMap.values()].reduce(
          (sum, row) => addPaise(sum, row.revenueCollectedPaise),
          0,
        ),
        rows: [...staffMap.values()].filter(
          (row) =>
            row.ordersPlaced ||
            row.itemsPrepared ||
            row.itemsReady ||
            row.itemsServed ||
            row.paymentsCollected,
        ),
      },
      activity: {
        orders: nonCancelled.length,
        items: itemsOrdered,
        paymentCount: revenue.paymentCount,
        activeTables: activeTableIds.size,
        guestRequests,
        index: activityIndex,
      },
      trends: {
        orders: {
          current: nonCancelled.length,
          previous: prevOrders.filter((order) => order.status !== "CANCELLED").length,
          percent: trendPercent(nonCancelled.length, prevOrders.filter((order) => order.status !== "CANCELLED").length),
        },
        netRevenuePaise: {
          current: revenue.netCapturedPaise,
          previous: prevRevenue.netCapturedPaise,
          percent: trendPercent(revenue.netCapturedPaise, prevRevenue.netCapturedPaise),
        },
        onTimePercent: {
          current: onTimePercent ?? 0,
          previous: prevOnTimePercent,
          percent: trendPercent(onTimePercent ?? 0, prevOnTimePercent),
        },
        avgServeMs: {
          current: avgServe,
          previous: prevAvgServe,
          percent: trendPercent(avgServe, prevAvgServe),
        },
        overdue: {
          current: overdueItems.length,
          previous: prevOverdue,
          percent: trendPercent(overdueItems.length, prevOverdue),
        },
        refundsPaise: {
          current: revenue.refundsPaise,
          previous: prevRevenue.refundsPaise,
          percent: trendPercent(revenue.refundsPaise, prevRevenue.refundsPaise),
        },
        errors: {
          current: reliabilitySerialized.failedRequests,
          previous: prevErrors,
          percent: null,
        },
      },
      hrefs: hrefs(tenantId, restaurant.id),
    };
  });

  const slaSamples = rows.reduce((sum, row) => sum + row.kitchen.sla.servedEligible, 0);
  const slaOnTime = rows.reduce((sum, row) => sum + row.kitchen.sla.onTime, 0);
  const slaMissed = rows.reduce((sum, row) => sum + row.kitchen.sla.missed, 0);
  const slaPct = slaSamples > 0 ? (slaOnTime / slaSamples) * 100 : null;
  const sla = slaLabel({ missedCount: slaMissed, sampleCount: slaSamples, onTimePercent: slaPct });

  const tenant = params.tenantId
    ? restaurants[0]?.tenant ??
      (await prisma.tenant.findUnique({
        where: { id: params.tenantId },
        select: { id: true, name: true, slug: true, isEnabled: true },
      }))
    : null;

  const tenantCount = params.tenantId
    ? tenant
      ? 1
      : 0
    : new Set(rows.map((row) => row.tenantId).filter(Boolean)).size ||
      (await prisma.tenant.count());

  return {
    range: {
      preset: range.preset,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      fromDate: range.fromDate,
      toDate: range.toDate,
      label: range.label,
    },
    generatedAt: now.toISOString(),
    summary: {
      tenantCount,
      restaurantCount: rows.length,
      enabledRestaurants: rows.filter((row) => row.restaurantEnabled).length,
      activeNow: rows.filter((row) => row.status === "active").length,
      orders: rows.reduce((sum, row) => sum + row.period.orders, 0),
      netCapturedPaise: rows.reduce((sum, row) => addPaise(sum, row.revenue.netCapturedPaise), 0),
      onTimePercent: slaPct,
      slaSample: slaSamples,
      slaLabel: sla.text,
      needAttention: rows.filter((row) => row.needsAttention).length,
    },
    restaurants: rows,
    rankings: params.tenantId || params.restaurantId ? buildRankings(rows) : undefined,
    tenant: tenant
      ? { id: tenant.id, name: tenant.name, slug: tenant.slug, enabled: tenant.isEnabled }
      : undefined,
  };
}

function buildRankings(rows: RestaurantCommandRow[]): RankingRow[] {
  const pick = (
    key: string,
    label: string,
    score: (row: RestaurantCommandRow) => number,
    display: (row: RestaurantCommandRow) => string,
    direction: "max" | "min" = "max",
    eligible: (row: RestaurantCommandRow) => boolean = () => true,
  ): RankingRow | null => {
    const candidates = rows.filter(eligible);
    if (!candidates.length) return null;
    const sorted = [...candidates].sort((a, b) =>
      direction === "max" ? score(b) - score(a) : score(a) - score(b),
    );
    const winner = sorted[0]!;
    return {
      key,
      label,
      restaurantId: winner.restaurantId,
      restaurantName: winner.restaurantName,
      value: score(winner),
      display: display(winner),
    };
  };

  return [
    pick("most-orders", "Most orders", (row) => row.period.orders, (row) => `${row.period.orders} orders`),
    pick("highest-revenue", "Highest revenue", (row) => row.revenue.netCapturedPaise, (row) => formatInrFromPaise(row.revenue.netCapturedPaise)),
    pick(
      "best-sla",
      "Best on-time SLA",
      (row) => row.kitchen.sla.onTimePercent ?? -1,
      (row) => row.kitchen.sla.label,
      "max",
      (row) => row.kitchen.sla.servedEligible > 0,
    ),
    pick(
      "worst-sla",
      "Worst on-time SLA",
      (row) => row.kitchen.sla.onTimePercent ?? 101,
      (row) => row.kitchen.sla.label,
      "min",
      (row) => row.kitchen.sla.servedEligible > 0,
    ),
    pick(
      "fastest-service",
      "Fastest average service",
      (row) => row.service.orderToServed.average ?? Number.POSITIVE_INFINITY,
      (row) =>
        row.service.orderToServed.average == null
          ? "—"
          : `${Math.round(row.service.orderToServed.average / 60000)}m avg`,
      "min",
      (row) => row.service.orderToServed.sampleCount > 0,
    ),
    pick(
      "slowest-service",
      "Slowest average service",
      (row) => row.service.orderToServed.average ?? -1,
      (row) =>
        row.service.orderToServed.average == null
          ? "—"
          : `${Math.round(row.service.orderToServed.average / 60000)}m avg`,
      "max",
      (row) => row.service.orderToServed.sampleCount > 0,
    ),
    pick("most-overdue", "Most overdue", (row) => row.current.overdue, (row) => `${row.current.overdue} overdue`),
    pick(
      "payment-failures",
      "Most payment failures",
      (row) => row.money.failedGatewayAttempts,
      (row) => `${row.money.failedGatewayAttempts} failed attempts`,
    ),
    pick("print-failures", "Most print failures", (row) => row.printing.failures, (row) => `${row.printing.failures} failures`),
    pick("api-errors", "Most API errors", (row) => row.reliability.requestFailed + row.reliability.http5xx, (row) => `${row.reliability.requestFailed + row.reliability.http5xx} errors`),
  ].filter((row): row is RankingRow => Boolean(row));
}

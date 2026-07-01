import { prisma } from "@/lib/prisma";
import { todayDateString, isOrderItemOpen } from "@/lib/utils";
import { openTableOrdering, closeTableOrdering, hasOpenTableWork } from "@/lib/table-ordering-service";
import { getOrderPaymentSummaries } from "@/lib/payment-allocation-service";

export type TableFloorState =
  | "available"
  | "seated"
  | "ordering"
  | "kitchen"
  | "eating"
  | "payment"
  | "overdue";

export const FLOOR_STATE_LABELS: Record<
  TableFloorState,
  { label: string; description: string }
> = {
  available: { label: "Available", description: "Empty — ready for guests" },
  seated: { label: "Seated", description: "Guests seated, no order yet" },
  ordering: { label: "Ordering", description: "Guests are placing an order" },
  kitchen: { label: "Kitchen", description: "Items cooking on the line" },
  eating: { label: "Eating", description: "Food served, guests dining" },
  payment: { label: "Payment", description: "Bill ready — awaiting payment" },
  overdue: { label: "Overdue", description: "Kitchen item past prep deadline" },
};

const ATTEND_ALERT_TYPE = "FLOOR_ATTEND";

function deriveTableState(input: {
  orderingEnabled: boolean;
  effectiveSeatedAt: Date | null;
  activeItems: number;
  overdueItems: number;
  awaitingPayment: boolean;
  openOrders: number;
}): TableFloorState {
  if (input.overdueItems > 0) return "overdue";
  if (input.activeItems > 0) return "kitchen";
  if (input.awaitingPayment) return "payment";
  if (input.openOrders > 0 && input.orderingEnabled) return "ordering";
  if (
    input.effectiveSeatedAt &&
    !input.orderingEnabled &&
    input.openOrders === 0 &&
    input.activeItems === 0
  ) {
    return "seated";
  }
  if (input.effectiveSeatedAt || input.orderingEnabled) return "eating";
  return "available";
}

async function ensureTableAttendAlerts(
  restaurantId: string,
  tables: Array<{
    number: number;
    assignedServer: { id: string; name: string } | null;
    occupancyMinutes: number | null;
    stats: { orderCount: number };
    state: TableFloorState;
  }>,
) {
  for (const table of tables) {
    if (!table.assignedServer) continue;
    if (table.stats.orderCount > 0) continue;
    if (table.state === "available") continue;
    if (table.occupancyMinutes == null || table.occupancyMinutes < 5) continue;

    const existing = await prisma.alert.findFirst({
      where: {
        restaurantId,
        tableNumber: table.number,
        type: ATTEND_ALERT_TYPE,
        isRead: false,
        createdAt: { gte: new Date(Date.now() - 30 * 60_000) },
      },
    });
    if (existing) continue;

    await prisma.alert.create({
      data: {
        restaurantId,
        type: ATTEND_ALERT_TYPE,
        tableNumber: table.number,
        message: `Table ${table.number}: please attend and take order (${table.occupancyMinutes} min open, ${table.assignedServer.name})`,
      },
    });
  }
}

export async function getFloorSnapshot(restaurantId: string) {
  const today = todayDateString();
  const [tables, servers, orders] = await Promise.all([
    prisma.table.findMany({
      where: { restaurantId, isActive: true },
      orderBy: { number: "asc" },
      include: {
        assignedServer: { select: { id: true, name: true, role: true } },
      },
    }),
    prisma.user.findMany({
      where: { restaurantId, role: "SERVER" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.order.findMany({
      where: { restaurantId, date: today, status: { not: "CANCELLED" } },
      include: { items: true },
    }),
  ]);

  const ordersByTable = new Map<string, typeof orders>();
  for (const order of orders) {
    const list = ordersByTable.get(order.tableId) ?? [];
    list.push(order);
    ordersByTable.set(order.tableId, list);
  }

  const servedOrderIds = orders.filter((o) => o.status === "SERVED").map((o) => o.id);
  const paymentSummaries = await getOrderPaymentSummaries(servedOrderIds);

  const tableSnapshots = tables.map((table, index) => {
    const tableOrders = ordersByTable.get(table.id) ?? [];
    const activeItems = tableOrders.reduce(
      (sum, order) =>
        sum + order.items.filter((item) => isOrderItemOpen(item.status)).length,
      0,
    );
    const overdueItems = tableOrders.reduce(
      (sum, order) =>
        sum +
        order.items.filter((item) => item.isOverdue && isOrderItemOpen(item.status)).length,
      0,
    );
    const openOrders = tableOrders.filter((o) => o.status !== "SERVED").length;

    let billTotal = 0;
    let paidTotal = 0;
    let awaitingPayment = false;
    for (const order of tableOrders) {
      if (order.status !== "SERVED") continue;
      const summary = paymentSummaries.get(order.id);
      if (!summary) continue;
      billTotal += summary.total;
      paidTotal += summary.paid;
      if (summary.remaining > 0) awaitingPayment = true;
    }

    const isTableOpen = table.orderingEnabled || Boolean(table.seatedAt || table.orderingOpenedAt);
    const occupancyStartedAt =
      table.assignedServerId && isTableOpen
        ? table.seatedAt ?? table.orderingOpenedAt
        : null;
    const occupancyMinutes = occupancyStartedAt
      ? Math.floor((Date.now() - occupancyStartedAt.getTime()) / 60000)
      : null;

    const cols = 4;
    const defaultX = (index % cols) * 112 + 16;
    const defaultY = Math.floor(index / cols) * 112 + 16;

    const state = deriveTableState({
      orderingEnabled: table.orderingEnabled,
      effectiveSeatedAt: occupancyStartedAt,
      activeItems,
      overdueItems,
      awaitingPayment,
      openOrders,
    });

    return {
      id: table.id,
      number: table.number,
      section: table.section,
      orderingEnabled: table.orderingEnabled,
      positionX: table.positionX ?? defaultX,
      positionY: table.positionY ?? defaultY,
      width: table.width ?? 96,
      height: table.height ?? 96,
      guestCount: table.guestCount,
      seatedAt: occupancyStartedAt?.toISOString() ?? null,
      elapsedMinutes: occupancyMinutes,
      occupancyMinutes,
      assignedServer: table.assignedServer,
      state,
      stats: {
        orderCount: tableOrders.length,
        activeItems,
        overdueItems,
        billTotal,
        paidTotal,
        remaining: Math.max(0, billTotal - paidTotal),
      },
    };
  });

  await ensureTableAttendAlerts(restaurantId, tableSnapshots);

  return { tables: tableSnapshots, servers, stateLegend: FLOOR_STATE_LABELS };
}

export async function updateTableFloor(
  restaurantId: string,
  tableId: string,
  data: {
    positionX?: number;
    positionY?: number;
    width?: number;
    height?: number;
    section?: string | null;
    assignedServerId?: string | null;
    guestCount?: number | null;
    seated?: boolean;
    clear?: boolean;
  },
) {
  const table = await prisma.table.findFirst({
    where: { id: tableId, restaurantId },
  });
  if (!table) return { error: "Table not found" as const };

  if (data.clear) {
    if (await hasOpenTableWork(tableId)) {
      return { error: "Table has open orders or an unpaid bill" as const };
    }
    await closeTableOrdering(tableId);
    const updated = await prisma.table.update({
      where: { id: tableId },
      data: {
        seatedAt: null,
        guestCount: null,
        assignedServerId: null,
      },
    });
    return { table: updated };
  }

  if (data.assignedServerId) {
    const server = await prisma.user.findFirst({
      where: {
        id: data.assignedServerId,
        restaurantId,
        role: "SERVER",
      },
    });
    if (!server) {
      return { error: "Invalid server for this restaurant" as const };
    }
  }

  if (data.guestCount != null) {
    if (!Number.isInteger(data.guestCount) || data.guestCount < 1 || data.guestCount > 20) {
      return { error: "Guest count must be between 1 and 20" as const };
    }
  }

  if (data.seated) {
    await openTableOrdering(tableId);
  }

  const tableIsOpen =
    data.seated === true ||
    table.orderingEnabled ||
    Boolean(table.seatedAt || table.orderingOpenedAt);

  let seatedAt: Date | null | undefined;
  if (data.seated === false) {
    seatedAt = null;
  } else if (
    data.seated === true &&
    !table.seatedAt &&
    !table.orderingOpenedAt
  ) {
    seatedAt = new Date();
  } else if (
    data.assignedServerId &&
    tableIsOpen &&
    !table.seatedAt &&
    !table.orderingOpenedAt
  ) {
    seatedAt = new Date();
  }

  const patch: {
    positionX?: number;
    positionY?: number;
    width?: number;
    height?: number;
    section?: string | null;
    assignedServerId?: string | null;
    guestCount?: number | null;
    seatedAt?: Date | null;
  } = {};

  if (data.positionX !== undefined) patch.positionX = data.positionX;
  if (data.positionY !== undefined) patch.positionY = data.positionY;
  if (data.width !== undefined) patch.width = data.width;
  if (data.height !== undefined) patch.height = data.height;
  if (data.section !== undefined) patch.section = data.section;
  if (data.assignedServerId !== undefined) patch.assignedServerId = data.assignedServerId;
  if (data.guestCount !== undefined) patch.guestCount = data.guestCount;
  if (seatedAt !== undefined) patch.seatedAt = seatedAt;

  const updated = await prisma.table.update({
    where: { id: tableId },
    data: patch,
  });
  return { table: updated };
}

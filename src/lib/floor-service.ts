import { prisma } from "@/lib/prisma";
import { todayDateString, sumOrderRevenue, isOrderItemOpen } from "@/lib/utils";
import { openTableOrdering, closeTableOrdering, hasOpenTableWork } from "@/lib/table-ordering-service";
import { getOrderPaymentSummary } from "@/lib/payment-allocation-service";

export type TableFloorState =
  | "available"
  | "seated"
  | "ordering"
  | "kitchen"
  | "eating"
  | "payment"
  | "overdue";

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
  if (input.effectiveSeatedAt && !input.orderingEnabled && input.openOrders === 0 && input.activeItems === 0) {
    return "seated";
  }
  if (input.effectiveSeatedAt || input.orderingEnabled) return "eating";
  return "available";
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

  const tableSnapshots = await Promise.all(
    tables.map(async (table, index) => {
      const tableOrders = ordersByTable.get(table.id) ?? [];
      const activeItems = tableOrders.reduce(
        (sum, order) =>
          sum + order.items.filter((item) => isOrderItemOpen(item.status)).length,
        0,
      );
      const overdueItems = tableOrders.reduce(
        (sum, order) =>
          sum +
          order.items.filter(
            (item) => item.isOverdue && isOrderItemOpen(item.status),
          ).length,
        0,
      );
      const openOrders = tableOrders.filter((o) => o.status !== "SERVED").length;

      let billTotal = 0;
      let paidTotal = 0;
      let awaitingPayment = false;
      for (const order of tableOrders) {
        if (order.status !== "SERVED") continue;
        const summary = await getOrderPaymentSummary(order.id);
        if (!summary) continue;
        billTotal += summary.total;
        paidTotal += summary.paid;
        if (summary.remaining > 0) awaitingPayment = true;
      }

      const effectiveSeatedAt = table.seatedAt ?? table.orderingOpenedAt;
      const elapsedMinutes = effectiveSeatedAt
        ? Math.floor((Date.now() - effectiveSeatedAt.getTime()) / 60000)
        : null;

      const cols = 4;
      const defaultX = (index % cols) * 112 + 16;
      const defaultY = Math.floor(index / cols) * 112 + 16;

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
        seatedAt: effectiveSeatedAt?.toISOString() ?? null,
        elapsedMinutes,
        assignedServer: table.assignedServer,
        state: deriveTableState({
          orderingEnabled: table.orderingEnabled,
          effectiveSeatedAt,
          activeItems,
          overdueItems,
          awaitingPayment,
          openOrders,
        }),
        stats: {
          orderCount: tableOrders.length,
          activeItems,
          overdueItems,
          billTotal,
          paidTotal,
          remaining: Math.max(0, billTotal - paidTotal),
        },
      };
    }),
  );

  return { tables: tableSnapshots, servers };
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

  const seatedAt =
    data.seated === true && !table.seatedAt && !table.orderingOpenedAt
      ? new Date()
      : data.seated === false
        ? null
        : undefined;

  const updated = await prisma.table.update({
    where: { id: tableId },
    data: {
      positionX: data.positionX,
      positionY: data.positionY,
      width: data.width,
      height: data.height,
      section: data.section,
      assignedServerId: data.assignedServerId,
      guestCount: data.guestCount,
      seatedAt,
    },
  });
  return { table: updated };
}

import { prisma } from "@/lib/prisma";
import { todayDateString, isOrderItemOpen } from "@/lib/utils";
import { openTableOrdering, closeTableOrdering, hasOpenTableWork } from "@/lib/table-ordering-service";
import { getTableDraftItemCounts } from "@/lib/table-cart-draft-service";
import { getTableTabPaymentSummary } from "@/lib/table-tab-service";

export type TableFloorState =
  | "available"
  | "seated"
  | "ordering"
  | "kitchen"
  | "ready"
  | "eating"
  | "payment"
  | "overdue";

export const FLOOR_STATE_LABELS: Record<
  TableFloorState,
  { label: string; description: string }
> = {
  available: { label: "Available", description: "Empty — ready for guests" },
  seated: { label: "Seated", description: "Guests seated, no order yet" },
  ordering: { label: "Ordering", description: "Cart has items or guests are placing an order" },
  kitchen: { label: "Kitchen", description: "Items cooking on the line" },
  ready: { label: "Ready", description: "Food ready — waiting to be served" },
  eating: { label: "Eating", description: "Food served, guests dining" },
  payment: { label: "Payment", description: "Consolidated bill — awaiting payment" },
  overdue: { label: "Overdue", description: "Kitchen item past prep deadline" },
};

const ATTEND_ALERT_TYPE = "FLOOR_ATTEND";

function deriveTableState(input: {
  effectiveSeatedAt: Date | null;
  draftItemCount: number;
  kitchenItems: number;
  readyItems: number;
  overdueItems: number;
  servedUnpaid: boolean;
  paymentRequested: boolean;
}): TableFloorState {
  if (input.overdueItems > 0) return "overdue";
  if (input.paymentRequested && input.servedUnpaid) return "payment";
  if (input.readyItems > 0 && input.kitchenItems === 0) return "ready";
  if (input.kitchenItems > 0) return "kitchen";
  if (input.draftItemCount > 0) return "ordering";
  if (input.servedUnpaid) return "eating";
  if (input.effectiveSeatedAt) return "seated";
  return "available";
}

async function ensureTableAttendAlerts(
  restaurantId: string,
  tables: Array<{
    number: number;
    assignedServer: { id: string; name: string } | null;
    occupancyMinutes: number | null;
    stats: { orderCount: number; draftItemCount: number };
    state: TableFloorState;
  }>,
) {
  for (const table of tables) {
    if (!table.assignedServer) continue;
    if (table.stats.orderCount > 0 || table.stats.draftItemCount > 0) continue;
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

  const tableIds = tables.map((t) => t.id);
  const draftCounts = await getTableDraftItemCounts(tableIds);

  const ordersByTable = new Map<string, typeof orders>();
  for (const order of orders) {
    const list = ordersByTable.get(order.tableId) ?? [];
    list.push(order);
    ordersByTable.set(order.tableId, list);
  }

  const tableSnapshots = await Promise.all(
    tables.map(async (table, index) => {
      const tableOrders = ordersByTable.get(table.id) ?? [];
      const kitchenItems = tableOrders.reduce(
        (sum, order) =>
          sum +
          order.items.filter(
            (item) =>
              isOrderItemOpen(item.status) &&
              (item.status === "PENDING" || item.status === "PREPARING"),
          ).length,
        0,
      );
      const readyItems = tableOrders.reduce(
        (sum, order) =>
          sum + order.items.filter((item) => item.status === "READY").length,
        0,
      );
      const overdueItems = tableOrders.reduce(
        (sum, order) =>
          sum +
          order.items.filter((item) => item.isOverdue && isOrderItemOpen(item.status)).length,
        0,
      );
      const draftItemCount = draftCounts.get(table.id) ?? 0;

      const tabSummary = await getTableTabPaymentSummary(table.id);
      const servedUnpaid = tabSummary.remaining > 0.01;

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
        effectiveSeatedAt: occupancyStartedAt,
        draftItemCount,
        kitchenItems,
        readyItems,
        overdueItems,
        servedUnpaid,
        paymentRequested: tabSummary.paymentRequested,
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
          draftItemCount,
          kitchenItems,
          readyItems,
          activeItems: kitchenItems + readyItems,
          overdueItems,
          billTotal: tabSummary.billTotal,
          paidTotal: tabSummary.paidTotal,
          remaining: tabSummary.remaining,
        },
      };
    }),
  );

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

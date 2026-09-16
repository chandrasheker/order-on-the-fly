import { prisma } from "@/lib/prisma";
import { purgeStaleTableSessions } from "@/lib/table-session-service";
import { todayDateString } from "@/lib/utils";
import { clearTableCartDraft } from "@/lib/table-cart-draft-service";
import { clearTableTabFlags, isTabFullySettled, ensureTableTabId } from "@/lib/table-tab-service";
import { isSelfPickupOrder } from "@/lib/fulfillment/collection";

export async function hasOpenTableWork(tableId: string) {
  const count = await prisma.order.count({
    where: {
      tableId,
      date: todayDateString(),
      status: { not: "CANCELLED" },
      OR: [
        { status: { not: "SERVED" } },
        {
          paidAt: null,
          items: { some: { status: "SERVED" } },
        },
      ],
    },
  });
  if (count > 0) return true;

  const draftCount = await prisma.tableCartDraft.count({ where: { tableId } });
  return draftCount > 0;
}

async function endTableVisit(tableId: string, orderingEnabled: boolean) {
  await purgeStaleTableSessions(tableId);
  await prisma.tableSession.deleteMany({ where: { tableId } });

  const settled = await isTabFullySettled(tableId);
  if (settled) {
    await clearTableCartDraft({ tableId });
    await clearTableTabFlags(tableId);
    await prisma.table.update({
      where: { id: tableId },
      data: {
        orderingEnabled,
        orderingOpenedAt: null,
        seatedAt: null,
        guestCount: null,
        assignedServerId: null,
      },
    });
    return;
  }

  await prisma.table.update({
    where: { id: tableId },
    data: {
      orderingEnabled,
      ...(orderingEnabled ? {} : { orderingOpenedAt: null }),
    },
  });
}

/** Owner/staff explicitly disable QR ordering. Stays closed until they enable it again. */
export async function closeTableOrdering(tableId: string) {
  await endTableVisit(tableId, false);
}

/** End a visit after payment or floor clear and close QR admission. */
export async function releaseTableVisit(tableId: string) {
  await endTableVisit(tableId, false);
}

export async function openTableOrdering(tableId: string) {
  const table = await prisma.table.findUnique({ where: { id: tableId } });
  await ensureTableTabId(tableId);
  await prisma.table.update({
    where: { id: tableId },
    data: {
      orderingEnabled: true,
      orderingOpenedAt: new Date(),
      seatedAt: table?.seatedAt ?? new Date(),
    },
  });
}

async function todaysVisitOrders(tableId: string) {
  return prisma.order.findMany({
    where: { tableId, date: todayDateString(), status: { not: "CANCELLED" } },
    select: { fulfillmentMode: true, status: true },
  });
}

function hasOpenDineInWork(
  visitOrders: Array<{ fulfillmentMode: string | null; status: string }>,
) {
  return visitOrders.some((order) => !isSelfPickupOrder(order) && order.status !== "SERVED");
}

/** I'll-collect must not seat or close a dine-in table. Keep QR available for the next guest. */
export async function keepDineInTableAvailableForPickup(tableId: string) {
  const visitOrders = await todaysVisitOrders(tableId);
  if (hasOpenDineInWork(visitOrders)) return;

  await prisma.table.update({
    where: { id: tableId },
    data: {
      orderingEnabled: true,
      orderingOpenedAt: null,
      seatedAt: null,
      guestCount: null,
    },
  });
}

export async function maybeAutoCloseTableAfterPayment(tableId: string) {
  const table = await prisma.table.findUnique({
    where: { id: tableId },
    select: {
      restaurant: { select: { serviceMode: true } },
    },
  });

  const visitOrders = await todaysVisitOrders(tableId);
  const hasPickup = visitOrders.some((order) => isSelfPickupOrder(order));
  if (table?.restaurant.serviceMode === "SELF_SERVICE" || hasPickup) {
    await keepDineInTableAvailableForPickup(tableId);
    return;
  }

  if (!(await isTabFullySettled(tableId))) return;

  await releaseTableVisit(tableId);
}

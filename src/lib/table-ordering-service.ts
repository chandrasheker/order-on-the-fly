import { prisma } from "@/lib/prisma";
import { purgeStaleTableSessions } from "@/lib/table-session-service";
import { todayDateString } from "@/lib/utils";

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
  return count > 0;
}

export async function closeTableOrdering(tableId: string) {
  await purgeStaleTableSessions(tableId);
  await prisma.tableSession.deleteMany({ where: { tableId } });
  await prisma.table.update({
    where: { id: tableId },
    data: {
      orderingEnabled: false,
      orderingOpenedAt: null,
      seatedAt: null,
      guestCount: null,
      assignedServerId: null,
    },
  });
}

export async function openTableOrdering(tableId: string) {
  const table = await prisma.table.findUnique({ where: { id: tableId } });
  await prisma.table.update({
    where: { id: tableId },
    data: {
      orderingEnabled: true,
      orderingOpenedAt: new Date(),
      seatedAt: table?.seatedAt ?? new Date(),
    },
  });
}

export async function maybeAutoCloseTableAfterPayment(tableId: string) {
  const today = todayDateString();
  const openOrders = await prisma.order.count({
    where: {
      tableId,
      date: today,
      status: { notIn: ["SERVED", "CANCELLED"] },
    },
  });
  if (openOrders > 0) return;

  const unpaidServed = await prisma.order.count({
    where: {
      tableId,
      date: today,
      status: "SERVED",
      paidAt: null,
      items: { some: { status: "SERVED" } },
    },
  });
  if (unpaidServed > 0) return;

  await closeTableOrdering(tableId);
}

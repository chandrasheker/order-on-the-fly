import { prisma } from "@/lib/prisma";
import { leaveTableSession, purgeStaleTableSessions } from "@/lib/table-session-service";

export async function closeTableOrdering(tableId: string) {
  await purgeStaleTableSessions(tableId);
  await prisma.tableSession.deleteMany({ where: { tableId } });
  await prisma.table.update({
    where: { id: tableId },
    data: { orderingEnabled: false, orderingOpenedAt: null },
  });
}

export async function openTableOrdering(tableId: string) {
  await prisma.table.update({
    where: { id: tableId },
    data: { orderingEnabled: true, orderingOpenedAt: new Date() },
  });
}

export async function maybeAutoCloseTableAfterPayment(tableId: string) {
  const openOrders = await prisma.order.count({
    where: {
      tableId,
      status: { notIn: ["SERVED", "CANCELLED"] },
    },
  });
  if (openOrders > 0) return;

  const unpaidServed = await prisma.order.count({
    where: {
      tableId,
      status: "SERVED",
      paidAt: null,
      items: { some: { status: "SERVED" } },
    },
  });
  if (unpaidServed > 0) return;

  await closeTableOrdering(tableId);
}

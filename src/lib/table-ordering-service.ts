import { prisma } from "@/lib/prisma";
import { purgeStaleTableSessions } from "@/lib/table-session-service";
import { todayDateString } from "@/lib/utils";
import { clearTableCartDraft } from "@/lib/table-cart-draft-service";
import { clearTableTabFlags, isTabFullySettled, ensureTableTabId } from "@/lib/table-tab-service";

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

export async function closeTableOrdering(tableId: string) {
  await purgeStaleTableSessions(tableId);
  await prisma.tableSession.deleteMany({ where: { tableId } });
  await clearTableCartDraft({ tableId });
  await clearTableTabFlags(tableId);
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

export async function maybeAutoCloseTableAfterPayment(tableId: string) {
  if (!(await isTabFullySettled(tableId))) return;

  await closeTableOrdering(tableId);
}

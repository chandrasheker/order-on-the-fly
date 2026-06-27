import { prisma } from "@/lib/prisma";

/** Sessions with no heartbeat within this window are removed. */
export const SESSION_TTL_MS = 10 * 60 * 1000;

export function sessionCutoff() {
  return new Date(Date.now() - SESSION_TTL_MS);
}

export async function purgeStaleTableSessions(tableId: string) {
  return prisma.tableSession.deleteMany({
    where: { tableId, lastSeenAt: { lt: sessionCutoff() } },
  });
}

export async function countActiveTableSessions(tableId: string) {
  await purgeStaleTableSessions(tableId);
  return prisma.tableSession.count({ where: { tableId } });
}

export async function joinTableSession(
  tableId: string,
  sessionKey: string,
  maxSessions: number
) {
  await purgeStaleTableSessions(tableId);

  const existing = await prisma.tableSession.findUnique({
    where: { tableId_sessionKey: { tableId, sessionKey } },
  });

  if (existing) {
    await prisma.tableSession.update({
      where: { id: existing.id },
      data: { lastSeenAt: new Date() },
    });
    const activeCount = await prisma.tableSession.count({ where: { tableId } });
    return {
      active: true,
      returning: true,
      maxSessions,
      activeCount,
    };
  }

  const activeCount = await prisma.tableSession.count({ where: { tableId } });
  if (activeCount >= maxSessions) {
    return {
      active: false,
      returning: false,
      maxSessions,
      activeCount,
    };
  }

  await prisma.tableSession.create({
    data: { tableId, sessionKey, lastSeenAt: new Date() },
  });

  return {
    active: true,
    returning: false,
    maxSessions,
    activeCount: activeCount + 1,
  };
}

export async function heartbeatTableSession(tableId: string, sessionKey: string) {
  await purgeStaleTableSessions(tableId);
  const session = await prisma.tableSession.findUnique({
    where: { tableId_sessionKey: { tableId, sessionKey } },
  });
  if (!session) return false;
  await prisma.tableSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  });
  return true;
}

export async function leaveTableSession(tableId: string, sessionKey: string) {
  await prisma.tableSession.deleteMany({
    where: { tableId, sessionKey },
  });
}

export async function validateTableSession(tableId: string, sessionKey: string) {
  await purgeStaleTableSessions(tableId);
  const session = await prisma.tableSession.findUnique({
    where: { tableId_sessionKey: { tableId, sessionKey } },
  });
  return Boolean(session);
}

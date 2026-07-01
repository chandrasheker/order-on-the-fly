import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/client";

export const STAFF_SESSION_ACTIVE_MS = 15 * 60_000;

function activeSince() {
  return new Date(Date.now() - STAFF_SESSION_ACTIVE_MS);
}

export async function startStaffSession(params: {
  userId: string;
  restaurantId: string;
  tenantId?: string | null;
  role: Role;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  return prisma.staffSession.create({
    data: {
      userId: params.userId,
      restaurantId: params.restaurantId,
      tenantId: params.tenantId ?? null,
      role: params.role,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    },
  });
}

export async function touchStaffSession(sessionId: string) {
  await prisma.staffSession.updateMany({
    where: { id: sessionId, logoutAt: null },
    data: { lastSeenAt: new Date() },
  });
}

export async function endStaffSession(sessionId: string) {
  await prisma.staffSession.updateMany({
    where: { id: sessionId, logoutAt: null },
    data: { logoutAt: new Date() },
  });
}

export async function endStaffSessionsForUser(userId: string) {
  await prisma.staffSession.updateMany({
    where: { userId, logoutAt: null },
    data: { logoutAt: new Date() },
  });
}

export async function endStaffSessionsForRestaurant(restaurantId: string) {
  await prisma.staffSession.updateMany({
    where: { restaurantId, logoutAt: null },
    data: { logoutAt: new Date() },
  });
}

export async function endStaffSessionsForTenant(tenantId: string) {
  const restaurantIds = (
    await prisma.restaurant.findMany({
      where: { tenantId },
      select: { id: true },
    })
  ).map((r) => r.id);

  await prisma.staffSession.updateMany({
    where: {
      logoutAt: null,
      OR: [
        { tenantId },
        ...(restaurantIds.length > 0 ? [{ restaurantId: { in: restaurantIds } }] : []),
      ],
    },
    data: { logoutAt: new Date() },
  });
}

/** Keep platform active-login counts accurate after disable/re-enable or stale JWT session ids. */
export async function syncStaffSessionForUser(params: {
  userId: string;
  restaurantId: string;
  tenantId?: string | null;
  role: Role;
  preferredSessionId?: string | null;
}) {
  if (params.preferredSessionId) {
    const preferred = await prisma.staffSession.findUnique({
      where: { id: params.preferredSessionId },
    });
    if (
      preferred &&
      !preferred.logoutAt &&
      preferred.userId === params.userId &&
      preferred.restaurantId === params.restaurantId
    ) {
      await touchStaffSession(preferred.id);
      return preferred.id;
    }
  }

  const existing = await prisma.staffSession.findFirst({
    where: {
      userId: params.userId,
      restaurantId: params.restaurantId,
      logoutAt: null,
      lastSeenAt: { gte: activeSince() },
    },
    orderBy: { lastSeenAt: "desc" },
  });
  if (existing) {
    await touchStaffSession(existing.id);
    return existing.id;
  }

  const created = await startStaffSession({
    userId: params.userId,
    restaurantId: params.restaurantId,
    tenantId: params.tenantId,
    role: params.role,
  });
  return created.id;
}

export async function getActiveStaffSessionsForRestaurant(restaurantId: string) {
  return prisma.staffSession.findMany({
    where: {
      restaurantId,
      logoutAt: null,
      lastSeenAt: { gte: activeSince() },
    },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { lastSeenAt: "desc" },
  });
}

export async function getActiveStaffSessionsByRestaurants(restaurantIds: string[]) {
  if (restaurantIds.length === 0) return new Map<string, Awaited<ReturnType<typeof getActiveStaffSessionsForRestaurant>>>();

  const sessions = await prisma.staffSession.findMany({
    where: {
      restaurantId: { in: restaurantIds },
      logoutAt: null,
      lastSeenAt: { gte: activeSince() },
    },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { lastSeenAt: "desc" },
  });

  const map = new Map<string, typeof sessions>();
  for (const id of restaurantIds) map.set(id, []);
  for (const session of sessions) {
    const list = map.get(session.restaurantId) ?? [];
    list.push(session);
    map.set(session.restaurantId, list);
  }
  return map;
}

export function summarizeActiveSessions(
  sessions: Array<{ role: Role; user: { name: string; email: string }; lastSeenAt: Date }>,
) {
  const byRole = { OWNER: 0, MANAGER: 0, COOK: 0, SERVER: 0 };
  for (const session of sessions) {
    byRole[session.role] += 1;
  }
  return {
    total: sessions.length,
    byRole,
    users: sessions.map((s) => ({
      name: s.user.name,
      email: s.user.email,
      role: s.role,
      lastSeenAt: s.lastSeenAt.toISOString(),
    })),
  };
}

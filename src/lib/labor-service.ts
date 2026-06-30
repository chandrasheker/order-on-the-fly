import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { todayDateString } from "@/lib/utils";

function shiftHours(clockIn: Date, clockOut: Date) {
  return Math.max(0, (clockOut.getTime() - clockIn.getTime()) / 3_600_000);
}

export async function clockIn(restaurantId: string, userId: string) {
  if (!(await isFeatureEnabled(restaurantId, "labor_clock"))) {
    throw new Error("Labor clock not enabled");
  }

  const open = await prisma.shiftClock.findFirst({
    where: { restaurantId, userId, clockOutAt: null },
  });
  if (open) return open;

  return prisma.shiftClock.create({
    data: { restaurantId, userId },
    include: { user: { select: { name: true, role: true, email: true } } },
  });
}

export async function clockOut(restaurantId: string, userId: string) {
  if (!(await isFeatureEnabled(restaurantId, "labor_clock"))) {
    throw new Error("Labor clock not enabled");
  }

  const open = await prisma.shiftClock.findFirst({
    where: { restaurantId, userId, clockOutAt: null },
    orderBy: { clockInAt: "desc" },
  });
  if (!open) throw new Error("No open shift");

  return prisma.shiftClock.update({
    where: { id: open.id },
    data: { clockOutAt: new Date() },
    include: { user: { select: { name: true, role: true, email: true } } },
  });
}

export async function getLaborDashboard(restaurantId: string, date = todayDateString()) {
  const start = new Date(`${date}T00:00:00.000`);
  const end = new Date(`${date}T23:59:59.999`);

  const [shifts, payments] = await Promise.all([
    prisma.shiftClock.findMany({
      where: { restaurantId, clockInAt: { lte: end }, OR: [{ clockOutAt: null }, { clockOutAt: { gte: start } }] },
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { clockInAt: "desc" },
    }),
    prisma.payment.aggregate({
      where: { restaurantId, createdAt: { gte: start, lte: end } },
      _sum: { amount: true },
    }),
  ]);

  const now = new Date();
  let totalHours = 0;
  const byStaff = shifts.map((s) => {
    const out = s.clockOutAt ?? now;
    const hours = shiftHours(s.clockInAt, out);
    totalHours += hours;
    return {
      id: s.id,
      userId: s.userId,
      name: s.user.name,
      role: s.user.role,
      clockInAt: s.clockInAt.toISOString(),
      clockOutAt: s.clockOutAt?.toISOString() ?? null,
      hours: Math.round(hours * 100) / 100,
      open: !s.clockOutAt,
    };
  });

  const revenue = payments._sum.amount ?? 0;
  const splh = totalHours > 0 ? Math.round((revenue / totalHours) * 100) / 100 : 0;

  return { date, shifts: byStaff, totalHours: Math.round(totalHours * 100) / 100, revenue, splh };
}

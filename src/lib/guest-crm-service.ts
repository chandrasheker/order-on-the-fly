import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/lib/feature-flags";

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "").slice(-10);
}

export async function touchGuestProfile(params: {
  restaurantId: string;
  phone?: string | null;
  name?: string | null;
  orderTotal?: number;
}) {
  if (!(await isFeatureEnabled(params.restaurantId, "guest_crm"))) return null;
  if (!params.phone?.trim()) return null;

  const phone = normalizePhone(params.phone);
  if (phone.length < 10) return null;

  const existing = await prisma.guestProfile.findUnique({
    where: { restaurantId_phone: { restaurantId: params.restaurantId, phone } },
  });

  if (existing) {
    return prisma.guestProfile.update({
      where: { id: existing.id },
      data: {
        name: params.name?.trim() || existing.name,
        visitCount: existing.visitCount + 1,
        totalSpend: existing.totalSpend + (params.orderTotal ?? 0),
        lastVisitAt: new Date(),
      },
    });
  }

  return prisma.guestProfile.create({
    data: {
      restaurantId: params.restaurantId,
      phone,
      name: params.name?.trim() || null,
      visitCount: 1,
      totalSpend: params.orderTotal ?? 0,
      lastVisitAt: new Date(),
    },
  });
}

export async function recordGuestPayment(params: {
  restaurantId: string;
  phone?: string | null;
  amount: number;
}) {
  if (!(await isFeatureEnabled(params.restaurantId, "guest_crm"))) return;
  if (!params.phone?.trim()) return;

  const phone = normalizePhone(params.phone);
  const profile = await prisma.guestProfile.findUnique({
    where: { restaurantId_phone: { restaurantId: params.restaurantId, phone } },
  });
  if (!profile) return;

  await prisma.guestProfile.update({
    where: { id: profile.id },
    data: { totalSpend: profile.totalSpend + params.amount },
  });
}

export async function lookupGuestByPhone(restaurantId: string, phone: string) {
  const normalized = normalizePhone(phone);
  return prisma.guestProfile.findUnique({
    where: { restaurantId_phone: { restaurantId, phone: normalized } },
  });
}

export async function listGuestProfiles(restaurantId: string, limit = 200) {
  return prisma.guestProfile.findMany({
    where: { restaurantId },
    orderBy: { lastVisitAt: "desc" },
    take: limit,
  });
}

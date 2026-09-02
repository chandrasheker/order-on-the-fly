import { prisma } from "@/lib/prisma";
import type { TenantPlan, SubscriptionStatus } from "@/generated/prisma/client";
import { canonicalizeName } from "@/lib/hostname-rules";

export async function ensureTenantForRestaurant(restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, name: true, slug: true, tenantId: true },
  });
  if (!restaurant) return null;
  if (restaurant.tenantId) {
    return prisma.tenant.findUnique({ where: { id: restaurant.tenantId } });
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: restaurant.name,
      nameNormalized: canonicalizeName(restaurant.name),
      slug: restaurant.slug,
      plan: "STARTER",
      subscriptionStatus: "TRIAL",
      subscriptions: {
        create: {
          plan: "STARTER",
          status: "TRIAL",
          currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        },
      },
    },
  });

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { tenantId: tenant.id },
  });

  return tenant;
}

export async function updateTenantSubscription(
  tenantId: string,
  data: { plan?: TenantPlan; status?: SubscriptionStatus; currentPeriodEnd?: Date | null },
) {
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      ...(data.plan ? { plan: data.plan } : {}),
      ...(data.status ? { subscriptionStatus: data.status } : {}),
    },
  });

  await prisma.tenantSubscription.create({
    data: {
      tenantId,
      plan: data.plan ?? tenant.plan,
      status: data.status ?? tenant.subscriptionStatus,
      currentPeriodEnd: data.currentPeriodEnd ?? null,
    },
  });

  return tenant;
}

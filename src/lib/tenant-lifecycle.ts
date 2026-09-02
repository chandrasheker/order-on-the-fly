import { prisma } from "@/lib/prisma";
import { invalidateFeatureCache } from "@/lib/feature-flags";
import { invalidateHostTenantCache, invalidateHostTenantCacheForSlugs } from "@/platform/host-tenant";
import { endStaffSessionsForRestaurant, endStaffSessionsForTenant } from "@/lib/staff-session-service";

export async function setTenantEnabled(tenantId: string, isEnabled: boolean) {
  const tenantRow = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true },
  });
  if (!tenantRow) {
    throw new Error("Tenant not found");
  }

  const restaurants = await prisma.restaurant.findMany({
    where: { tenantId },
    select: { id: true, slug: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: tenantId },
      data: { isEnabled },
    });

    // Disable cascades to every restaurant. Re-enable does not — operators turn
    // restaurants back on individually after reviewing each location.
    if (!isEnabled) {
      await tx.restaurant.updateMany({
        where: { tenantId },
        data: { isEnabled: false },
      });
    }
  });

  await endStaffSessionsForTenant(tenantId);
  invalidateHostTenantCacheForSlugs([
    tenantRow.slug,
    ...restaurants.map((restaurant) => restaurant.slug),
  ]);
  for (const restaurant of restaurants) {
    invalidateFeatureCache(restaurant.id);
  }

  return { id: tenantId, isEnabled, restaurantCount: restaurants.length };
}

export async function setRestaurantEnabled(restaurantId: string, isEnabled: boolean) {
  const existing = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, slug: true },
  });
  if (!existing) {
    throw new Error("Restaurant not found");
  }

  const restaurant = await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { isEnabled },
    select: { id: true, slug: true },
  });

  if (!isEnabled) {
    await endStaffSessionsForRestaurant(restaurantId);
  }
  invalidateHostTenantCache(restaurant.slug);
  invalidateFeatureCache(restaurant.id);
  return restaurant;
}

async function wipeRestaurantRows(restaurantId: string) {
  await prisma.loginAuditLog.deleteMany({ where: { restaurantId } });
  await prisma.backgroundJob.deleteMany({ where: { restaurantId } });
  await prisma.restaurant.delete({ where: { id: restaurantId } });
}

export async function deleteRestaurantEverywhere(restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, slug: true },
  });
  if (!restaurant) {
    throw new Error("Restaurant not found");
  }

  await endStaffSessionsForRestaurant(restaurantId);
  await wipeRestaurantRows(restaurantId);

  invalidateHostTenantCache(restaurant.slug);
  invalidateFeatureCache(restaurant.id);
  return restaurant;
}

export async function deleteTenantEverywhere(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      slug: true,
      restaurants: { select: { id: true, slug: true } },
    },
  });
  if (!tenant) {
    throw new Error("Tenant not found");
  }

  await endStaffSessionsForTenant(tenantId);

  for (const restaurant of tenant.restaurants) {
    await wipeRestaurantRows(restaurant.id);
    invalidateHostTenantCache(restaurant.slug);
    invalidateFeatureCache(restaurant.id);
  }

  await prisma.loginAuditLog.deleteMany({ where: { tenantId } });
  await prisma.backgroundJob.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } });
  invalidateHostTenantCache(tenant.slug);

  return { id: tenantId, restaurantCount: tenant.restaurants.length };
}

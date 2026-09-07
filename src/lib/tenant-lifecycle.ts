import { prisma } from "@/lib/prisma";
import { invalidateFeatureCache } from "@/lib/feature-flags";
import { invalidateHostTenantCache, invalidateHostTenantCacheForSlugs } from "@/platform/host-tenant";
import { endStaffSessionsForRestaurant, endStaffSessionsForTenant } from "@/lib/staff-session-service";
import { syncTenantRestaurantHostnames } from "@/lib/hostname-allocation";

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
    const { appendPlatformAuditEventInTx } = await import("@/platform/forensics/platform-audit-service");
    const { AUDIT_ACTION, AUDIT_CATEGORY } = await import("@/platform/forensics/constants");
    await appendPlatformAuditEventInTx(tx, {
      category: AUDIT_CATEGORY.PLATFORM,
      action: isEnabled ? AUDIT_ACTION.TENANT_ENABLED : AUDIT_ACTION.TENANT_DISABLED,
      tenantId,
      resourceType: "Tenant",
      resourceId: tenantId,
      after: { isEnabled },
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

  const restaurant = await prisma.$transaction(async (tx) => {
    const next = await tx.restaurant.update({
      where: { id: restaurantId },
      data: { isEnabled },
      select: { id: true, slug: true, tenantId: true },
    });
    const { appendPlatformAuditEventInTx } = await import("@/platform/forensics/platform-audit-service");
    const { AUDIT_ACTION, AUDIT_CATEGORY } = await import("@/platform/forensics/constants");
    await appendPlatformAuditEventInTx(tx, {
      category: AUDIT_CATEGORY.PLATFORM,
      action: isEnabled ? AUDIT_ACTION.RESTAURANT_ENABLED : AUDIT_ACTION.RESTAURANT_DISABLED,
      restaurantId,
      tenantId: next.tenantId,
      resourceType: "Restaurant",
      resourceId: restaurantId,
      after: { isEnabled },
    });
    return next;
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
    select: { id: true, slug: true, tenantId: true },
  });
  if (!restaurant) {
    throw new Error("Restaurant not found");
  }

  const slugsToInvalidate = new Set<string>([restaurant.slug]);
  if (restaurant.tenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: restaurant.tenantId },
      select: { slug: true, restaurants: { select: { slug: true } } },
    });
    if (tenant) {
      slugsToInvalidate.add(tenant.slug);
      for (const row of tenant.restaurants) slugsToInvalidate.add(row.slug);
    }
  }

  await endStaffSessionsForRestaurant(restaurantId);

  const result = await prisma.$transaction(async (tx) => {
    await tx.loginAuditLog.deleteMany({ where: { restaurantId } });
    await tx.backgroundJob.deleteMany({ where: { restaurantId } });
    await tx.restaurant.delete({ where: { id: restaurantId } });

    if (!restaurant.tenantId) {
      return { hostnameChanges: [], notices: [] as string[] };
    }

    const hostPlan = await syncTenantRestaurantHostnames(tx, restaurant.tenantId);
    for (const row of hostPlan.restaurants) {
      slugsToInvalidate.add(row.previousSlug);
      slugsToInvalidate.add(row.slug);
    }
    slugsToInvalidate.add(hostPlan.tenantSlug);
    return { hostnameChanges: hostPlan.hostnameChanges, notices: hostPlan.notices };
  });

  invalidateHostTenantCacheForSlugs(slugsToInvalidate);
  invalidateFeatureCache(restaurant.id);
  return {
    id: restaurant.id,
    slug: restaurant.slug,
    hostnameChanges: result.hostnameChanges,
    notices: result.notices,
  };
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

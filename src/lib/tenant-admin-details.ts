import { prisma } from "@/lib/prisma";
import { getRestaurantFeatureFlags, serializeFeaturesForClient } from "@/lib/feature-flags";
import {
  getRestaurantPublicBaseUrl,
  getTenantHubPublicBaseUrl,
  publicTenantAdminUrl,
} from "@/lib/server-app-url";
import { getTenantBaseDomain } from "@/platform/host";
import { buildSlotKeys, defaultEmailForSlot, defaultNameForSlot, slotCountsFromRestaurant } from "@/lib/staff-slots";
import { roleForSlotKey } from "@/lib/staff-permissions";

type TenantOverview = NonNullable<
  Awaited<ReturnType<(typeof import("@/lib/tenant-onboarding-service"))["getTenantOverview"]>>
>;

export function presentTenantAdminOverview(overview: TenantOverview) {
  return {
    tenant: {
      ...overview.tenant,
      url: overview.tenant.hubActive ? getTenantHubPublicBaseUrl(overview.tenant.slug) : null,
      tenantAdminUrl: publicTenantAdminUrl({
        hubActive: overview.tenant.hubActive,
        tenantSlug: overview.tenant.slug,
        restaurants: overview.restaurants,
      }),
    },
    tenantBaseDomain: getTenantBaseDomain(),
    admins: overview.admins,
    subscriptions: overview.subscriptions,
    hostSlugs: overview.hostSlugs.map((row) => ({
      slug: row.slug,
      kind: row.kind,
      url: getRestaurantPublicBaseUrl(row.slug),
    })),
    restaurants: overview.restaurants.map((restaurant) => ({
      ...restaurant,
      url: getRestaurantPublicBaseUrl(restaurant.slug),
    })),
    stats: overview.stats,
  };
}

export async function listTenantAdminStaff(tenantId: string) {
  const restaurants = await prisma.restaurant.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
    include: {
      users: {
        select: { id: true, name: true, email: true, role: true, slotKey: true },
        orderBy: { slotKey: "asc" },
      },
    },
  });

  return restaurants.map((restaurant) => {
    const counts = slotCountsFromRestaurant(restaurant);
    return {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      staffConfigured: restaurant.staffConfigured,
      counts,
      slots: buildSlotKeys(counts).map((slotKey) => {
        const user = restaurant.users.find((row) => row.slotKey === slotKey);
        const role = roleForSlotKey(slotKey)!;
        return {
          slotKey,
          role,
          userId: user?.id ?? null,
          name: user?.name ?? defaultNameForSlot(slotKey),
          email: user?.email ?? defaultEmailForSlot(restaurant.slug, slotKey),
        };
      }),
    };
  });
}

export async function listTenantAdminFeatures(tenantId: string) {
  const restaurants = await prisma.restaurant.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });

  return Promise.all(
    restaurants.map(async (restaurant) => {
      const flags = await getRestaurantFeatureFlags(restaurant.id);
      return {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        features: serializeFeaturesForClient(flags),
      };
    }),
  );
}

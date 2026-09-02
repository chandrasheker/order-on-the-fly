import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { getTenantBaseDomain } from "@/platform/host";
import { restaurantSlugValidationError } from "@/lib/restaurant-slug";
import {
  canonicalizeName,
  hostnameInUseError,
  plannedRestaurantHostSlug,
  tenantHubIsActive,
  tenantSlugFromName,
} from "@/lib/hostname-rules";

type Db = PrismaClient | Prisma.TransactionClient;

export const HOST_KIND_RESTAURANT = "restaurant";
export const HOST_KIND_TENANT_HUB = "tenant_hub";

function baseDomain() {
  return getTenantBaseDomain() || "dvadtech.in";
}

export function assertAssignableHostnameSlug(slug: string) {
  const error = restaurantSlugValidationError(slug);
  if (error) throw new Error(error);
  return slug;
}

export async function hostnameSlugTaken(
  db: Db,
  slug: string,
  except?: { restaurantId?: string; tenantHubId?: string },
) {
  const lease = await db.hostSlug.findUnique({ where: { slug } });
  if (lease) {
    if (except?.restaurantId && lease.kind === HOST_KIND_RESTAURANT && lease.restaurantId === except.restaurantId) {
      return false;
    }
    if (except?.tenantHubId && lease.kind === HOST_KIND_TENANT_HUB && lease.tenantId === except.tenantHubId) {
      return false;
    }
    return true;
  }

  const restaurant = await db.restaurant.findUnique({
    where: { slug },
    select: { id: true, tenantId: true },
  });
  if (restaurant && restaurant.id !== except?.restaurantId) return true;

  const tenant = await db.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant) return false;
  if (tenant.id === except?.tenantHubId) return false;
  if (restaurant && restaurant.id === except?.restaurantId && restaurant.tenantId === tenant.id) {
    return false;
  }
  return true;
}

export async function assertHostnameAvailable(
  db: Db,
  slug: string,
  except?: { restaurantId?: string; tenantHubId?: string },
) {
  assertAssignableHostnameSlug(slug);
  if (await hostnameSlugTaken(db, slug, except)) {
    throw new Error(hostnameInUseError(slug, baseDomain()));
  }
}

export async function assertTenantNameAvailable(
  db: Db,
  name: string,
  exceptTenantId?: string,
) {
  const nameNormalized = canonicalizeName(name);
  const existing = await db.tenant.findUnique({
    where: { nameNormalized },
    select: { id: true },
  });
  if (existing && existing.id !== exceptTenantId) {
    throw new Error(`Tenant name "${name.trim()}" is already in use.`);
  }
}

export async function assertRestaurantNameAvailableInTenant(
  db: Db,
  tenantId: string,
  name: string,
  exceptRestaurantId?: string,
) {
  const nameNormalized = canonicalizeName(name);
  const existing = await db.restaurant.findFirst({
    where: { tenantId, nameNormalized },
    select: { id: true, name: true },
  });
  if (existing && existing.id !== exceptRestaurantId) {
    throw new Error(`Restaurant name "${name.trim()}" is already used in this tenant.`);
  }
}

export async function claimRestaurantHostname(
  db: Db,
  input: { slug: string; tenantId: string; restaurantId: string },
) {
  await assertHostnameAvailable(db, input.slug, {
    restaurantId: input.restaurantId,
    tenantHubId: input.tenantId,
  });
  const existing = await db.hostSlug.findUnique({ where: { slug: input.slug } });
  if (existing) {
    await db.hostSlug.update({
      where: { slug: input.slug },
      data: {
        kind: HOST_KIND_RESTAURANT,
        tenantId: input.tenantId,
        restaurantId: input.restaurantId,
      },
    });
    return;
  }
  await db.hostSlug.create({
    data: {
      slug: input.slug,
      kind: HOST_KIND_RESTAURANT,
      tenantId: input.tenantId,
      restaurantId: input.restaurantId,
    },
  });
}

export async function claimTenantHubHostname(db: Db, input: { slug: string; tenantId: string }) {
  await assertHostnameAvailable(db, input.slug, { tenantHubId: input.tenantId });
  const existing = await db.hostSlug.findUnique({ where: { slug: input.slug } });
  if (existing) {
    await db.hostSlug.update({
      where: { slug: input.slug },
      data: { kind: HOST_KIND_TENANT_HUB, tenantId: input.tenantId, restaurantId: null },
    });
    return;
  }
  await db.hostSlug.create({
    data: {
      slug: input.slug,
      kind: HOST_KIND_TENANT_HUB,
      tenantId: input.tenantId,
      restaurantId: null,
    },
  });
}

export async function releaseHostname(db: Db, slug: string) {
  await db.hostSlug.deleteMany({ where: { slug } });
}

export async function syncTenantHostLeases(
  db: Db,
  input: {
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    restaurants: Array<{ id: string; name: string; slug: string }>;
  },
) {
  const current = await db.hostSlug.findMany({
    where: { tenantId: input.tenantId },
    select: { slug: true, kind: true, restaurantId: true },
  });

  const wanted = new Map<string, { kind: string; restaurantId: string | null }>();
  for (const restaurant of input.restaurants) {
    wanted.set(restaurant.slug, { kind: HOST_KIND_RESTAURANT, restaurantId: restaurant.id });
  }
  if (
    tenantHubIsActive({
      tenantSlug: input.tenantSlug,
      tenantName: input.tenantName,
      restaurants: input.restaurants,
    })
  ) {
    wanted.set(input.tenantSlug, { kind: HOST_KIND_TENANT_HUB, restaurantId: null });
  }

  for (const lease of current) {
    const next = wanted.get(lease.slug);
    if (!next || next.kind !== lease.kind || next.restaurantId !== lease.restaurantId) {
      await db.hostSlug.delete({ where: { slug: lease.slug } });
    }
  }

  for (const [slug, next] of wanted) {
    if (next.kind === HOST_KIND_RESTAURANT && next.restaurantId) {
      await claimRestaurantHostname(db, {
        slug,
        tenantId: input.tenantId,
        restaurantId: next.restaurantId,
      });
    } else {
      await claimTenantHubHostname(db, { slug, tenantId: input.tenantId });
    }
  }
}

export function generatedRestaurantSlug(input: {
  tenantSlug: string;
  tenantName: string;
  restaurantName: string;
  totalRestaurantCount: number;
  explicitSlug?: string;
}) {
  const generated = plannedRestaurantHostSlug(input);
  const explicit = input.explicitSlug?.trim().toLowerCase();
  const slug = explicit || generated;
  assertAssignableHostnameSlug(slug);
  if (input.totalRestaurantCount > 1 && slug === input.tenantSlug) {
    throw new Error("Restaurant hostname cannot be the tenant dashboard hostname.");
  }
  return slug;
}

export function generatedTenantSlug(tenantName: string, explicitSlug?: string) {
  const slug = explicitSlug?.trim().toLowerCase() || tenantSlugFromName(tenantName);
  assertAssignableHostnameSlug(slug);
  return slug;
}

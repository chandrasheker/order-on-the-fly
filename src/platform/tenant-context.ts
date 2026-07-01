import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import type { HierarchyScope } from "@/platform/hierarchy";

export type TenantContext = HierarchyScope & {
  restaurantName: string;
  restaurantSlug: string;
  branchName?: string | null;
  floorName?: string | null;
};

const cache = new Map<string, { ctx: TenantContext; expiresAt: number }>();
const CACHE_MS = 60_000;

export async function resolveTenantContext(params: {
  restaurantId: string;
  branchId?: string | null;
  floorId?: string | null;
}): Promise<TenantContext> {
  const key = `${params.restaurantId}:${params.branchId ?? ""}:${params.floorId ?? ""}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.ctx;

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: params.restaurantId },
    select: {
      id: true,
      name: true,
      slug: true,
      tenantId: true,
      tenant: { select: { id: true, name: true } },
    },
  });
  if (!restaurant) throw new Error("Restaurant not found");
  if (!restaurant.tenantId) {
    const { ensureTenantForRestaurant } = await import("@/lib/tenant-service");
    await ensureTenantForRestaurant(params.restaurantId);
    return resolveTenantContext(params);
  }

  let branchName: string | null = null;
  if (params.branchId) {
    const branch = await prisma.branch.findUnique({
      where: { id: params.branchId },
      select: { name: true },
    });
    branchName = branch?.name ?? null;
  }

  let floorName: string | null = null;
  if (params.floorId) {
    const floor = await prisma.floor.findUnique({
      where: { id: params.floorId },
      select: { name: true },
    });
    floorName = floor?.name ?? null;
  }

  const ctx: TenantContext = {
    tenantId: restaurant.tenantId,
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    restaurantSlug: restaurant.slug,
    branchId: params.branchId ?? null,
    floorId: params.floorId ?? null,
    branchName,
    floorName,
  };

  cache.set(key, { ctx, expiresAt: Date.now() + CACHE_MS });
  return ctx;
}

export async function tenantContextFromSession(
  session: SessionUser,
  overrides?: { branchId?: string | null; floorId?: string | null },
): Promise<TenantContext> {
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { branchId: true },
  });
  return resolveTenantContext({
    restaurantId: session.restaurantId,
    branchId: overrides?.branchId ?? user?.branchId ?? null,
    floorId: overrides?.floorId ?? null,
  });
}

export function clearTenantContextCache() {
  cache.clear();
}

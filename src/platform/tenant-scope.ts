/**
 * Tenant-safe access helpers.
 *
 * Hostname restaurant context is authoritative. Callers never take
 * restaurantId from the request body/query when a restaurant host is present.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  jsonHostTenantNotFound,
  resolveTenantFromHeaders,
  resolveTenantFromHost,
  restaurantIdFromResolution,
  type HostTenantResolution,
} from "@/platform/host-tenant";
import {
  pathSlugMatchesHost,
  classifyRequestHost,
  selectOwnedResource,
  trustedRestaurantId,
  injectionIgnored,
  blocksRestaurantOperationsOnHost,
} from "@/platform/host";

export { selectOwnedResource, trustedRestaurantId, injectionIgnored };

export function opaqueNotFoundJson() {
  return NextResponse.json(jsonHostTenantNotFound(), { status: 404 });
}

export async function resolveRequestRestaurant(
  req: { headers: Headers },
): Promise<HostTenantResolution> {
  return resolveTenantFromHost(req);
}

export function hostRestaurantId(resolution: HostTenantResolution): string | null {
  return restaurantIdFromResolution(resolution);
}

export function restaurantOpsAllowedOnResolution(resolution: HostTenantResolution): boolean {
  if (!resolution.ok) return false;
  if (blocksRestaurantOperationsOnHost(resolution.host)) return false;
  return true;
}

export function scopeResourceForResolution<T extends { restaurantId: string }>(
  resolution: HostTenantResolution,
  resource: T | null | undefined,
): T | null {
  if (!restaurantOpsAllowedOnResolution(resolution)) return null;
  return selectOwnedResource(hostRestaurantId(resolution), resource);
}

/** Restaurant hosts query by identifier + host restaurantId. Reserved/dev may look up by identifier only. */
export function tableByQrWhere(qrToken: string, hostRestaurantId: string | null) {
  if (hostRestaurantId) return { qrToken, restaurantId: hostRestaurantId };
  return { qrToken };
}

export function orderByIdWhere(orderId: string, hostRestaurantId: string | null) {
  if (hostRestaurantId) return { id: orderId, restaurantId: hostRestaurantId };
  return { id: orderId };
}

/** Resolve a table by QR token, scoped to the hostname restaurant when present. */
export async function loadTableByQrForRequest(req: { headers: Headers }, qrToken: string) {
  const resolution = await resolveTenantFromHost(req);
  if (!restaurantOpsAllowedOnResolution(resolution)) {
    return { table: null, resolution };
  }

  const hostId = hostRestaurantId(resolution);
  const table = hostId
    ? await prisma.table.findFirst({
        where: tableByQrWhere(qrToken, hostId),
        include: { restaurant: true },
      })
    : await prisma.table.findUnique({
        where: { qrToken },
        include: { restaurant: true },
      });
  return { table: scopeResourceForResolution(resolution, table), resolution };
}

/** Resolve an order by id, scoped to the hostname restaurant when present. */
export async function loadOrderByIdForRequest(req: { headers: Headers }, orderId: string) {
  const resolution = await resolveTenantFromHost(req);
  if (!restaurantOpsAllowedOnResolution(resolution)) {
    return { order: null, resolution };
  }

  const hostId = hostRestaurantId(resolution);
  const order = hostId
    ? await prisma.order.findFirst({
        where: orderByIdWhere(orderId, hostId),
        include: { items: true, table: true },
      })
    : await prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true, table: true },
      });
  return { order: scopeResourceForResolution(resolution, order), resolution };
}

export function assertPathSlugForResolution(
  slug: string,
  resolution: HostTenantResolution,
): boolean {
  if (!resolution.ok) return false;
  if (resolution.kind === "reserved") return true;
  return pathSlugMatchesHost(slug, resolution.host);
}

export async function assertPagePathSlug(slug: string): Promise<boolean> {
  const resolution = await resolveTenantFromHeaders();
  return assertPathSlugForResolution(slug, resolution);
}

export async function rejectIfHostInvalid(req: { headers: Headers }) {
  const resolution = await resolveTenantFromHost(req);
  if (!resolution.ok) return opaqueNotFoundJson();
  return null;
}

export function requestHostKind(req: { headers: Headers }) {
  return classifyRequestHost(req.headers);
}

/** Webhooks may arrive on the apex host; restaurant hosts must match the path slug. */
export async function rejectIfSlugEscapesHost(req: { headers: Headers }, slug: string) {
  const resolution = await resolveTenantFromHost(req);
  if (!resolution.ok) return opaqueNotFoundJson();
  if (!assertPathSlugForResolution(slug, resolution)) return opaqueNotFoundJson();
  return null;
}

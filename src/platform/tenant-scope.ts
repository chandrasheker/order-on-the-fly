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

/** Resolve a table by globally unique QR token, then verify hostname ownership. */
export async function loadTableByQrForRequest(req: { headers: Headers }, qrToken: string) {
  const resolution = await resolveTenantFromHost(req);
  if (!resolution.ok) {
    return { table: null, resolution };
  }

  const table = await prisma.table.findUnique({
    where: { qrToken },
    include: { restaurant: true },
  });
  const owned = selectOwnedResource(hostRestaurantId(resolution), table);
  return { table: owned, resolution };
}

/** Resolve an order by id, then verify hostname ownership. */
export async function loadOrderByIdForRequest(req: { headers: Headers }, orderId: string) {
  const resolution = await resolveTenantFromHost(req);
  if (!resolution.ok) {
    return { order: null, resolution };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, table: true },
  });
  const owned = selectOwnedResource(hostRestaurantId(resolution), order);
  return { order: owned, resolution };
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

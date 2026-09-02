/**
 * Authoritative hostname → TenantContext resolver.
 *
 * Restaurant subdomains (abc.dvadtech.in, abc.localhost) fail closed:
 * unknown slug, disabled restaurant/tenant, or missing hierarchy never
 * fall back to another restaurant.
 *
 * Reserved hosts (apex, www, platform, localhost, IPs) do not imply a
 * restaurant. Staff still bind via session; guests use path/QR scoped to
 * a slug. That reserved path is for local/dev and platform admin only.
 */
import type { TenantContext } from "@/platform/tenant-context";
import {
  classifyRequestHost,
  classifyHostname,
  getTrustedHostname,
  getTenantBaseDomain,
  type ClassifiedHost,
} from "@/platform/host";

export type HostTenantFailureReason =
  | "INVALID_HOST"
  | "UNKNOWN_SUBDOMAIN"
  | "RESTAURANT_DISABLED"
  | "TENANT_DISABLED"
  | "INVALID_HIERARCHY";

export type HostTenantResolution =
  | { ok: true; kind: "restaurant"; host: Extract<ClassifiedHost, { kind: "restaurant" }>; context: TenantContext }
  | { ok: true; kind: "reserved"; host: Extract<ClassifiedHost, { kind: "reserved" }> }
  | {
      ok: false;
      kind: "invalid" | "unknown" | "disabled" | "hierarchy";
      reason: HostTenantFailureReason;
      status: 404;
      host: ClassifiedHost;
    };

export class HostTenantError extends Error {
  readonly reason: HostTenantFailureReason;
  readonly status: 404;

  constructor(reason: HostTenantFailureReason, message = "Not found") {
    super(message);
    this.name = "HostTenantError";
    this.reason = reason;
    this.status = 404;
  }
}

export type RestaurantHostRow = {
  id: string;
  name: string;
  slug: string;
  tenantId: string | null;
  isEnabled: boolean;
  tenant: { id: string; isEnabled: boolean } | null;
};

export type HostTenantLookup = {
  findRestaurantBySlug: (slug: string) => Promise<RestaurantHostRow | null>;
  resolveContext?: (restaurant: RestaurantHostRow) => Promise<TenantContext>;
};

const defaultLookup: HostTenantLookup = {
  async findRestaurantBySlug(slug) {
    const { prisma } = await import("@/lib/prisma");
    return prisma.restaurant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        tenantId: true,
        isEnabled: true,
        tenant: { select: { id: true, isEnabled: true } },
      },
    });
  },
};

const slugCache = new Map<string, { resolution: HostTenantResolution; expiresAt: number }>();
const CACHE_MS = 15_000;

export function clearHostTenantCache() {
  slugCache.clear();
}

function fail(
  host: ClassifiedHost,
  reason: HostTenantFailureReason,
  kind: Extract<HostTenantResolution, { ok: false }>["kind"],
): HostTenantResolution {
  return { ok: false, kind, reason, status: 404, host };
}

export async function resolveTenantFromClassifiedHost(
  host: ClassifiedHost,
  lookup: HostTenantLookup = defaultLookup,
): Promise<HostTenantResolution> {
  if (host.kind === "invalid") {
    return fail(host, "INVALID_HOST", "invalid");
  }
  if (host.kind === "reserved") {
    return { ok: true, kind: "reserved", host };
  }

  const cacheKey = host.slug;
  const hit = slugCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.resolution;

  const restaurant = await lookup.findRestaurantBySlug(host.slug);
  if (!restaurant) {
    const resolution = fail(host, "UNKNOWN_SUBDOMAIN", "unknown");
    slugCache.set(cacheKey, { resolution, expiresAt: Date.now() + CACHE_MS });
    return resolution;
  }

  if (!restaurant.isEnabled) {
    return fail(host, "RESTAURANT_DISABLED", "disabled");
  }
  if (!restaurant.tenantId || !restaurant.tenant) {
    return fail(host, "INVALID_HIERARCHY", "hierarchy");
  }
  if (!restaurant.tenant.isEnabled) {
    return fail(host, "TENANT_DISABLED", "disabled");
  }

  if (!lookup.resolveContext) {
    const { getRestaurantAccessState } = await import("@/lib/access-control-service");
    const access = await getRestaurantAccessState(restaurant.id);
    if (!access.ok) {
      return fail(
        host,
        access.reason === "TENANT_DISABLED" ? "TENANT_DISABLED" : "RESTAURANT_DISABLED",
        "disabled",
      );
    }
  }

  const context = lookup.resolveContext
    ? await lookup.resolveContext(restaurant)
    : {
        tenantId: restaurant.tenantId,
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        restaurantSlug: restaurant.slug,
        branchId: null,
        floorId: null,
      };

  if (context.restaurantSlug !== host.slug || context.restaurantId !== restaurant.id) {
    return fail(host, "INVALID_HIERARCHY", "hierarchy");
  }
  if (!context.tenantId) {
    return fail(host, "INVALID_HIERARCHY", "hierarchy");
  }
  const resolution: HostTenantResolution = {
    ok: true,
    kind: "restaurant",
    host,
    context,
  };
  slugCache.set(cacheKey, { resolution, expiresAt: Date.now() + CACHE_MS });
  return resolution;
}

type HeaderSource = Headers | { headers: Headers } | { get(name: string): string | null };

function asHeaderReader(input: HeaderSource): { get(name: string): string | null } {
  if ("headers" in input && input.headers && typeof input.headers.get === "function") {
    return input.headers;
  }
  return input as { get(name: string): string | null };
}

export async function resolveTenantFromHost(
  headersOrRequest: HeaderSource,
  lookup: HostTenantLookup = defaultLookup,
): Promise<HostTenantResolution> {
  const host = classifyRequestHost(asHeaderReader(headersOrRequest));
  return resolveTenantFromClassifiedHost(host, lookup);
}

export async function resolveTenantFromHeaders(
  lookup: HostTenantLookup = defaultLookup,
): Promise<HostTenantResolution> {
  const { headers } = await import("next/headers");
  return resolveTenantFromHost(await headers(), lookup);
}

/** Restaurant-host only. Reserved hosts and failures throw HostTenantError. */
export async function requireTenantContext(
  headersOrRequest: HeaderSource,
  lookup: HostTenantLookup = defaultLookup,
): Promise<TenantContext> {
  const resolution = await resolveTenantFromHost(headersOrRequest, lookup);
  if (resolution.ok && resolution.kind === "restaurant") {
    return resolution.context;
  }
  if (resolution.ok && resolution.kind === "reserved") {
    throw new HostTenantError("INVALID_HOST", "Not found");
  }
  throw new HostTenantError(resolution.reason);
}

export function hostTenantNotFoundResponse(): { error: string; status: 404 } {
  return { error: "Not found", status: 404 };
}

export function jsonHostTenantNotFound() {
  return { error: "Not found" as const };
}

export function restaurantIdFromResolution(resolution: HostTenantResolution): string | null {
  if (resolution.ok && resolution.kind === "restaurant") return resolution.context.restaurantId;
  return null;
}

export function hostnameFromRequest(headersOrRequest: HeaderSource): string {
  return getTrustedHostname(asHeaderReader(headersOrRequest));
}

/** Operator-facing host summary for `/api/health`. Does not leak restaurant ids or names. */
export function hostHealthSummary(resolution: HostTenantResolution) {
  const host = resolution.host;
  return {
    kind: host.kind,
    hostname: "hostname" in host ? host.hostname : "",
    slug: host.kind === "restaurant" ? host.slug : null,
    tenantBaseDomain: getTenantBaseDomain() || null,
    apexRestaurantMode: process.env.TENANT_APEX_RESTAURANT === "1",
    ok: resolution.ok,
    reason: resolution.ok ? null : resolution.reason,
  };
}

export { classifyHostname, classifyRequestHost };

import { prisma } from "@/lib/prisma";
import { extraLogFilterWhere, isLogPreset, presetWhere, type LogPreset } from "@/platform/command-center/log-presets";
import {
  aggregateErrorFingerprints,
  queryPlatformAuditEvents,
  type ForensicScope,
  type PlatformAuditQuery,
} from "@/platform/forensics/platform-audit-service";

export class CommandCenterScopeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CommandCenterScopeError";
  }
}

export function parseLogSearchParams(search: URLSearchParams): {
  query: PlatformAuditQuery;
  preset: LogPreset;
  aggregateErrors: boolean;
  failedOnly: boolean;
  ambiguousOnly: boolean;
} {
  const parseDate = (value: string | null) => {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  };
  const preset = isLogPreset(search.get("preset")) ? (search.get("preset") as LogPreset) : "all";
  const extra = [
    presetWhere(preset),
    extraLogFilterWhere({
      failedOnly: search.get("failedOnly") === "1" || search.get("failed") === "1",
      ambiguousOnly: search.get("ambiguousOnly") === "1" || search.get("ambiguous") === "1",
    }),
  ].filter((value): value is NonNullable<typeof value> => Boolean(value));
  return {
    preset,
    aggregateErrors: search.get("aggregate") === "errors" || preset === "errors",
    failedOnly: search.get("failedOnly") === "1" || search.get("failed") === "1",
    ambiguousOnly: search.get("ambiguousOnly") === "1" || search.get("ambiguous") === "1",
    query: {
      from: parseDate(search.get("from")),
      to: parseDate(search.get("to")),
      eventKind: search.get("eventKind") ?? undefined,
      severity: search.get("severity") ?? undefined,
      category: search.get("category") ?? undefined,
      action: search.get("action") ?? undefined,
      outcome: search.get("outcome") ?? undefined,
      actorType: search.get("actorType") ?? undefined,
      actorId: search.get("actorId") ?? undefined,
      actorRole: search.get("actorRole") ?? undefined,
      actorName: search.get("actorName") ?? undefined,
      clientIp: search.get("clientIp") ?? undefined,
      hostname: search.get("hostname") ?? undefined,
      branchId: search.get("branchId") ?? undefined,
      resourceType: search.get("resourceType") ?? undefined,
      resourceId: search.get("resourceId") ?? undefined,
      requestId: search.get("requestId") ?? undefined,
      correlationId: search.get("correlationId") ?? undefined,
      errorCode: search.get("errorCode") ?? undefined,
      errorFingerprint: search.get("errorFingerprint") ?? search.get("fingerprint") ?? undefined,
      q: search.get("q") ?? undefined,
      cursor: search.get("cursor"),
      limit: search.get("limit") ? Number(search.get("limit")) : 50,
      extraWhere: extra.length ? { AND: extra } : undefined,
    },
  };
}

export function rejectScopeOverride(search: URLSearchParams, forced: { tenantId?: string; restaurantId?: string }) {
  const clientTenant = search.get("tenantId");
  const clientRestaurant = search.get("restaurantId");
  if (forced.tenantId && clientTenant && clientTenant !== forced.tenantId) {
    throw new CommandCenterScopeError("tenant scope cannot be overridden", 400);
  }
  if (forced.restaurantId && clientRestaurant && clientRestaurant !== forced.restaurantId) {
    throw new CommandCenterScopeError("restaurant scope cannot be overridden", 400);
  }
  if (!forced.tenantId && !forced.restaurantId && (clientTenant || clientRestaurant)) {
    throw new CommandCenterScopeError("platform logs cannot be widened into tenant or restaurant scope", 400);
  }
}

export async function resolveTenantLogScope(tenantId: string, restaurantId?: string | null) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, restaurants: { select: { id: true, name: true } } },
  });
  if (!tenant) throw new CommandCenterScopeError("Tenant not found", 404);
  const restaurantIds = tenant.restaurants.map((row) => row.id);
  if (restaurantId) {
    const restaurant = tenant.restaurants.find((row) => row.id === restaurantId);
    if (!restaurant) throw new CommandCenterScopeError("Restaurant not found in tenant", 404);
    return {
      tenant,
      restaurants: tenant.restaurants,
      scope: { kind: "restaurant" as const, restaurantId },
    };
  }
  return {
    tenant,
    restaurants: tenant.restaurants,
    scope: { kind: "tenant" as const, tenantId: tenant.id, restaurantIds },
  };
}

export async function resolveRestaurantLogScope(tenantId: string, restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, name: true, tenantId: true },
  });
  if (!restaurant || restaurant.tenantId !== tenantId) {
    throw new CommandCenterScopeError("Restaurant not found in tenant", 404);
  }
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true },
  });
  if (!tenant) throw new CommandCenterScopeError("Tenant not found", 404);
  return {
    tenant,
    restaurant,
    scope: { kind: "restaurant" as const, restaurantId: restaurant.id } satisfies ForensicScope,
  };
}

export async function queryScopedLogs(scope: ForensicScope, query: PlatformAuditQuery, aggregateErrors = false) {
  const scoped: PlatformAuditQuery = { ...query, scope };
  const [page, errorGroups] = await Promise.all([
    queryPlatformAuditEvents(scoped),
    aggregateErrors ? aggregateErrorFingerprints(scoped) : Promise.resolve(null),
  ]);
  return {
    ...page,
    scope: scope.kind,
    errorGroups,
  };
}

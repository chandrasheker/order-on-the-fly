import { prisma } from "@/lib/prisma";
import { AUDIT_ACTION, AUDIT_EVENT_KIND } from "@/platform/forensics/constants";
import type { ForensicScope } from "@/platform/forensics/platform-audit-service";

const FAILED_AUTH = [
  AUDIT_ACTION.STAFF_LOGIN_FAILED,
  AUDIT_ACTION.TENANT_ADMIN_LOGIN_FAILED,
  AUDIT_ACTION.PLATFORM_ADMIN_LOGIN_FAILED,
  AUDIT_ACTION.AUTHENTICATION_FAILED,
  AUDIT_ACTION.SESSION_REJECTED,
] as const;
const PERMISSION = [
  AUDIT_ACTION.PERMISSION_DENIED,
  AUDIT_ACTION.ROLE_PERMISSION_DENIED,
  AUDIT_ACTION.PLATFORM_AUDIT_ACCESS_DENIED,
] as const;
const CROSS_RESTAURANT = [
  AUDIT_ACTION.CROSS_RESTAURANT_ACCESS_DENIED,
  AUDIT_ACTION.CROSS_TENANT_ACCESS_DENIED,
  AUDIT_ACTION.WRONG_HOST_ACCESS_DENIED,
  AUDIT_ACTION.PUBLIC_TOKEN_HOST_MISMATCH,
] as const;
const PRINTER_AUTH = [
  AUDIT_ACTION.INVALID_PRINTER_AGENT_TOKEN,
  AUDIT_ACTION.REVOKED_PRINTER_AGENT_TOKEN,
  AUDIT_ACTION.PRINTER_AGENT_AUTH_FAILED,
] as const;
const RAZORPAY_SIG = [AUDIT_ACTION.RAZORPAY_SIGNATURE_INVALID] as const;
const JOB_FAIL = [AUDIT_ACTION.BACKGROUND_JOB_FAILED, AUDIT_ACTION.WEBHOOK_PROCESSING_FAILED] as const;
const PROVIDER_FAIL = [AUDIT_ACTION.PAYMENT_PROVIDER_API_FAILED, AUDIT_ACTION.RAZORPAY_REFUND_API_FAILED] as const;
const PRINT_FAIL = [AUDIT_ACTION.PRINT_JOB_FAILED, AUDIT_ACTION.PRINT_DELIVERY_FAILED] as const;
const SEMANTIC_SECURITY_ACTIONS = [
  ...FAILED_AUTH,
  ...PERMISSION,
  ...CROSS_RESTAURANT,
  ...PRINTER_AUTH,
  ...RAZORPAY_SIG,
] as const;

export type ReliabilityCounts = {
  requestFailed: number;
  http5xx: number;
  failedRequests: number;
  uniqueFingerprints: Set<string>;
  jobFailures: number;
  providerFailures: number;
  printFailures: number;
  securityDenials: number;
  failedAuth: number;
  permissionDenied: number;
  crossRestaurant: number;
  invalidPrinterAuth: number;
  razorpaySignature: number;
  otherSecurity: number;
  top: Map<
    string,
    { count: number; latest: Date; route: string | null; action: string | null; errorCode: string | null; restaurantId: string | null }
  >;
};

function emptyCounts(): ReliabilityCounts {
  return {
    requestFailed: 0,
    http5xx: 0,
    failedRequests: 0,
    uniqueFingerprints: new Set(),
    jobFailures: 0,
    providerFailures: 0,
    printFailures: 0,
    securityDenials: 0,
    failedAuth: 0,
    permissionDenied: 0,
    crossRestaurant: 0,
    invalidPrinterAuth: 0,
    razorpaySignature: 0,
    otherSecurity: 0,
    top: new Map(),
  };
}

function addCount(map: Map<string, ReliabilityCounts>, restaurantId: string | null, field: keyof ReliabilityCounts, n: number) {
  if (!restaurantId || !n) return;
  const counts = map.get(restaurantId);
  if (!counts) return;
  if (field === "uniqueFingerprints" || field === "top") return;
  counts[field] += n;
}

export function serializeReliability(counts: ReliabilityCounts) {
  return {
    requestFailed: counts.requestFailed,
    http5xx: counts.http5xx,
    failedRequests: counts.failedRequests,
    uniqueFingerprints: counts.uniqueFingerprints.size,
    jobFailures: counts.jobFailures,
    providerFailures: counts.providerFailures,
    printFailures: counts.printFailures,
    securityDenials: counts.securityDenials,
    failedAuth: counts.failedAuth,
    permissionDenied: counts.permissionDenied,
    crossRestaurant: counts.crossRestaurant,
    invalidPrinterAuth: counts.invalidPrinterAuth,
    razorpaySignature: counts.razorpaySignature,
    other: counts.otherSecurity,
    totalSecurity:
      counts.failedAuth +
      counts.permissionDenied +
      counts.crossRestaurant +
      counts.invalidPrinterAuth +
      counts.razorpaySignature +
      counts.otherSecurity,
    topErrors: [...counts.top.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([fingerprint, row]) => ({
        fingerprint,
        count: row.count,
        latest: row.latest.toISOString(),
        route: row.route,
        action: row.action,
        errorCode: row.errorCode,
        restaurantId: row.restaurantId,
      })),
  };
}

function failedRequestClause() {
  return {
    OR: [
      { action: AUDIT_ACTION.REQUEST_FAILED },
      { AND: [{ eventKind: AUDIT_EVENT_KIND.REQUEST }, { httpStatus: { gte: 500 } }] },
    ],
  };
}

function securityClause() {
  return {
    eventKind: { not: AUDIT_EVENT_KIND.REQUEST },
    OR: [{ eventKind: AUDIT_EVENT_KIND.SECURITY }, { action: { in: [...SEMANTIC_SECURITY_ACTIONS] } }],
  };
}

async function applyRestaurantAggregates(
  map: Map<string, ReliabilityCounts>,
  restaurantIds: string[],
  from: Date,
  to: Date,
) {
  const timeRestaurant = {
    occurredAt: { gte: from, lte: to },
    restaurantId: { in: restaurantIds },
  };

  const [
    requestFailed,
    http5xx,
    failedWithId,
    failedWithoutId,
    fingerprints,
    jobFailures,
    providerFailures,
    printFailures,
    securityByAction,
  ] = await Promise.all([
    prisma.platformAuditEvent.groupBy({
      by: ["restaurantId"],
      where: { ...timeRestaurant, action: AUDIT_ACTION.REQUEST_FAILED },
      _count: { _all: true },
    }),
    prisma.platformAuditEvent.groupBy({
      by: ["restaurantId"],
      where: { ...timeRestaurant, eventKind: AUDIT_EVENT_KIND.REQUEST, httpStatus: { gte: 500 } },
      _count: { _all: true },
    }),
    prisma.platformAuditEvent.groupBy({
      by: ["restaurantId", "requestId"],
      where: { AND: [timeRestaurant, { requestId: { not: null } }, failedRequestClause()] },
      _count: { _all: true },
    }),
    prisma.platformAuditEvent.groupBy({
      by: ["restaurantId"],
      where: { AND: [timeRestaurant, { requestId: null }, failedRequestClause()] },
      _count: { _all: true },
    }),
    prisma.platformAuditEvent.groupBy({
      by: ["restaurantId", "errorFingerprint"],
      where: { ...timeRestaurant, errorFingerprint: { not: null } },
      _count: { _all: true },
    }),
    prisma.platformAuditEvent.groupBy({
      by: ["restaurantId"],
      where: { ...timeRestaurant, action: { in: [...JOB_FAIL] } },
      _count: { _all: true },
    }),
    prisma.platformAuditEvent.groupBy({
      by: ["restaurantId"],
      where: { ...timeRestaurant, action: { in: [...PROVIDER_FAIL] } },
      _count: { _all: true },
    }),
    prisma.platformAuditEvent.groupBy({
      by: ["restaurantId"],
      where: { ...timeRestaurant, action: { in: [...PRINT_FAIL] } },
      _count: { _all: true },
    }),
    prisma.platformAuditEvent.groupBy({
      by: ["restaurantId", "action"],
      where: { AND: [timeRestaurant, securityClause()] },
      _count: { _all: true },
    }),
  ]);

  for (const row of requestFailed) addCount(map, row.restaurantId, "requestFailed", row._count._all);
  for (const row of http5xx) addCount(map, row.restaurantId, "http5xx", row._count._all);

  const failedUniques = new Map<string, number>();
  for (const row of failedWithId) {
    if (!row.restaurantId) continue;
    failedUniques.set(row.restaurantId, (failedUniques.get(row.restaurantId) ?? 0) + 1);
  }
  for (const row of failedWithoutId) {
    if (!row.restaurantId) continue;
    failedUniques.set(row.restaurantId, (failedUniques.get(row.restaurantId) ?? 0) + row._count._all);
  }
  for (const [restaurantId, count] of failedUniques) addCount(map, restaurantId, "failedRequests", count);

  for (const row of jobFailures) addCount(map, row.restaurantId, "jobFailures", row._count._all);
  for (const row of providerFailures) addCount(map, row.restaurantId, "providerFailures", row._count._all);
  for (const row of printFailures) addCount(map, row.restaurantId, "printFailures", row._count._all);

  for (const row of securityByAction) {
    if (!row.restaurantId) continue;
    const counts = map.get(row.restaurantId);
    if (!counts) continue;
    counts.securityDenials += row._count._all;
    if ((FAILED_AUTH as readonly string[]).includes(row.action)) counts.failedAuth += row._count._all;
    else if ((PERMISSION as readonly string[]).includes(row.action)) counts.permissionDenied += row._count._all;
    else if ((CROSS_RESTAURANT as readonly string[]).includes(row.action)) counts.crossRestaurant += row._count._all;
    else if ((PRINTER_AUTH as readonly string[]).includes(row.action)) counts.invalidPrinterAuth += row._count._all;
    else if ((RAZORPAY_SIG as readonly string[]).includes(row.action)) counts.razorpaySignature += row._count._all;
    else counts.otherSecurity += row._count._all;
  }

  const topPairs: Array<{ restaurantId: string; fingerprint: string; count: number }> = [];
  const byRestaurant = new Map<string, Array<{ fingerprint: string; count: number }>>();
  for (const row of fingerprints) {
    if (!row.restaurantId || !row.errorFingerprint) continue;
    const counts = map.get(row.restaurantId);
    if (!counts) continue;
    counts.uniqueFingerprints.add(row.errorFingerprint);
    const list = byRestaurant.get(row.restaurantId) ?? [];
    list.push({ fingerprint: row.errorFingerprint, count: row._count._all });
    byRestaurant.set(row.restaurantId, list);
  }
  for (const [restaurantId, list] of byRestaurant) {
    list.sort((a, b) => b.count - a.count);
    for (const item of list.slice(0, 8)) {
      topPairs.push({ restaurantId, fingerprint: item.fingerprint, count: item.count });
    }
  }

  if (topPairs.length) {
    const samples = await Promise.all(
      topPairs.map((pair) =>
        prisma.platformAuditEvent.findFirst({
          where: {
            restaurantId: pair.restaurantId,
            errorFingerprint: pair.fingerprint,
            occurredAt: { gte: from, lte: to },
          },
          orderBy: { occurredAt: "desc" },
          select: {
            restaurantId: true,
            errorFingerprint: true,
            occurredAt: true,
            route: true,
            action: true,
            errorCode: true,
          },
        }),
      ),
    );
    for (const [index, sample] of samples.entries()) {
      const pair = topPairs[index]!;
      const counts = map.get(pair.restaurantId);
      if (!counts) continue;
      counts.top.set(pair.fingerprint, {
        count: pair.count,
        latest: sample?.occurredAt ?? from,
        route: sample?.route ?? null,
        action: sample?.action ?? null,
        errorCode: sample?.errorCode ?? null,
        restaurantId: pair.restaurantId,
      });
    }
  }
}

export async function loadReliabilityByRestaurant(params: {
  restaurantIds: string[];
  from: Date;
  to: Date;
}) {
  const map = new Map<string, ReliabilityCounts>();
  for (const id of params.restaurantIds) map.set(id, emptyCounts());
  if (params.restaurantIds.length === 0) return map;
  await applyRestaurantAggregates(map, params.restaurantIds, params.from, params.to);
  return map;
}

export async function loadScopedReliability(scope: ForensicScope, from: Date, to: Date) {
  const restaurantIds =
    scope.kind === "restaurant"
      ? [scope.restaurantId]
      : scope.kind === "tenant"
        ? scope.restaurantIds
        : [];
  const map = new Map<string, ReliabilityCounts>();
  const scoped = emptyCounts();
  if (restaurantIds.length === 0) return scoped;
  for (const id of restaurantIds) map.set(id, emptyCounts());
  await applyRestaurantAggregates(map, restaurantIds, from, to);
  for (const counts of map.values()) {
    scoped.requestFailed += counts.requestFailed;
    scoped.http5xx += counts.http5xx;
    scoped.failedRequests += counts.failedRequests;
    scoped.jobFailures += counts.jobFailures;
    scoped.providerFailures += counts.providerFailures;
    scoped.printFailures += counts.printFailures;
    scoped.securityDenials += counts.securityDenials;
    scoped.failedAuth += counts.failedAuth;
    scoped.permissionDenied += counts.permissionDenied;
    scoped.crossRestaurant += counts.crossRestaurant;
    scoped.invalidPrinterAuth += counts.invalidPrinterAuth;
    scoped.razorpaySignature += counts.razorpaySignature;
    scoped.otherSecurity += counts.otherSecurity;
    for (const fingerprint of counts.uniqueFingerprints) scoped.uniqueFingerprints.add(fingerprint);
    for (const [fingerprint, row] of counts.top) {
      const existing = scoped.top.get(fingerprint);
      if (!existing || row.count > existing.count) scoped.top.set(fingerprint, row);
    }
  }
  return scoped;
}

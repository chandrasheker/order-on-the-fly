import { prisma } from "@/lib/prisma";
import { AUDIT_ACTION, AUDIT_EVENT_KIND } from "@/platform/forensics/constants";
import { forensicScopeWhere, type ForensicScope } from "@/platform/forensics/platform-audit-service";

const FAILED_AUTH = new Set<string>([
  AUDIT_ACTION.STAFF_LOGIN_FAILED,
  AUDIT_ACTION.TENANT_ADMIN_LOGIN_FAILED,
  AUDIT_ACTION.PLATFORM_ADMIN_LOGIN_FAILED,
  AUDIT_ACTION.AUTHENTICATION_FAILED,
  AUDIT_ACTION.SESSION_REJECTED,
]);
const PERMISSION = new Set<string>([
  AUDIT_ACTION.PERMISSION_DENIED,
  AUDIT_ACTION.ROLE_PERMISSION_DENIED,
  AUDIT_ACTION.PLATFORM_AUDIT_ACCESS_DENIED,
]);
const CROSS_RESTAURANT = new Set<string>([
  AUDIT_ACTION.CROSS_RESTAURANT_ACCESS_DENIED,
  AUDIT_ACTION.CROSS_TENANT_ACCESS_DENIED,
  AUDIT_ACTION.WRONG_HOST_ACCESS_DENIED,
  AUDIT_ACTION.PUBLIC_TOKEN_HOST_MISMATCH,
]);
const PRINTER_AUTH = new Set<string>([
  AUDIT_ACTION.INVALID_PRINTER_AGENT_TOKEN,
  AUDIT_ACTION.REVOKED_PRINTER_AGENT_TOKEN,
  AUDIT_ACTION.PRINTER_AGENT_AUTH_FAILED,
]);
const RAZORPAY_SIG = new Set<string>([AUDIT_ACTION.RAZORPAY_SIGNATURE_INVALID]);
const JOB_FAIL = new Set<string>([AUDIT_ACTION.BACKGROUND_JOB_FAILED, AUDIT_ACTION.WEBHOOK_PROCESSING_FAILED]);
const PROVIDER_FAIL = new Set<string>([
  AUDIT_ACTION.PAYMENT_PROVIDER_API_FAILED,
  AUDIT_ACTION.RAZORPAY_REFUND_API_FAILED,
]);
const PRINT_FAIL = new Set<string>([AUDIT_ACTION.PRINT_JOB_FAILED, AUDIT_ACTION.PRINT_DELIVERY_FAILED]);

export type ReliabilityCounts = {
  requestFailed: number;
  http5xx: number;
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
  top: Map<string, { count: number; latest: Date; route: string | null; action: string | null; errorCode: string | null; restaurantId: string | null }>;
};

function emptyCounts(): ReliabilityCounts {
  return {
    requestFailed: 0,
    http5xx: 0,
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

function consume(
  counts: ReliabilityCounts,
  event: {
    eventKind: string;
    action: string;
    outcome: string;
    httpStatus: number | null;
    errorFingerprint: string | null;
    occurredAt: Date;
    route: string | null;
    errorCode: string | null;
    restaurantId: string | null;
  },
) {
  if (event.action === AUDIT_ACTION.REQUEST_FAILED) counts.requestFailed += 1;
  if (event.httpStatus != null && event.httpStatus >= 500) counts.http5xx += 1;
  if (event.errorFingerprint) {
    counts.uniqueFingerprints.add(event.errorFingerprint);
    const existing = counts.top.get(event.errorFingerprint);
    if (!existing) {
      counts.top.set(event.errorFingerprint, {
        count: 1,
        latest: event.occurredAt,
        route: event.route,
        action: event.action,
        errorCode: event.errorCode,
        restaurantId: event.restaurantId,
      });
    } else {
      existing.count += 1;
      if (event.occurredAt > existing.latest) {
        existing.latest = event.occurredAt;
        existing.route = event.route;
        existing.action = event.action;
        existing.errorCode = event.errorCode;
        existing.restaurantId = event.restaurantId;
      }
    }
  }
  if (JOB_FAIL.has(event.action)) counts.jobFailures += 1;
  if (PROVIDER_FAIL.has(event.action)) counts.providerFailures += 1;
  if (PRINT_FAIL.has(event.action)) counts.printFailures += 1;
  const security =
    event.eventKind === AUDIT_EVENT_KIND.SECURITY ||
    event.outcome === "DENIED" ||
    FAILED_AUTH.has(event.action) ||
    PERMISSION.has(event.action);
  if (security) {
    counts.securityDenials += 1;
    if (FAILED_AUTH.has(event.action)) counts.failedAuth += 1;
    else if (PERMISSION.has(event.action)) counts.permissionDenied += 1;
    else if (CROSS_RESTAURANT.has(event.action)) counts.crossRestaurant += 1;
    else if (PRINTER_AUTH.has(event.action)) counts.invalidPrinterAuth += 1;
    else if (RAZORPAY_SIG.has(event.action)) counts.razorpaySignature += 1;
    else counts.otherSecurity += 1;
  }
}

export function serializeReliability(counts: ReliabilityCounts) {
  return {
    requestFailed: counts.requestFailed,
    http5xx: counts.http5xx,
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

export async function loadReliabilityByRestaurant(params: {
  restaurantIds: string[];
  from: Date;
  to: Date;
}) {
  const map = new Map<string, ReliabilityCounts>();
  for (const id of params.restaurantIds) map.set(id, emptyCounts());
  if (params.restaurantIds.length === 0) return map;

  const events = await prisma.platformAuditEvent.findMany({
    where: {
      occurredAt: { gte: params.from, lte: params.to },
      restaurantId: { in: params.restaurantIds },
    },
    select: {
      restaurantId: true,
      eventKind: true,
      action: true,
      outcome: true,
      httpStatus: true,
      errorFingerprint: true,
      occurredAt: true,
      route: true,
      errorCode: true,
    },
  });

  for (const event of events) {
    if (!event.restaurantId) continue;
    const counts = map.get(event.restaurantId);
    if (!counts) continue;
    consume(counts, event);
  }
  return map;
}

export async function loadScopedReliability(scope: ForensicScope, from: Date, to: Date) {
  const events = await prisma.platformAuditEvent.findMany({
    where: {
      AND: [forensicScopeWhere(scope), { occurredAt: { gte: from, lte: to } }],
    },
    select: {
      restaurantId: true,
      eventKind: true,
      action: true,
      outcome: true,
      httpStatus: true,
      errorFingerprint: true,
      occurredAt: true,
      route: true,
      errorCode: true,
    },
  });
  const counts = emptyCounts();
  for (const event of events) consume(counts, event);
  return counts;
}

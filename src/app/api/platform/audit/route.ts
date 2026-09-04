import { NextRequest, NextResponse } from "next/server";
import { PLATFORM_ADMIN_COOKIE, requirePlatformAdmin, verifyPlatformAdminToken } from "@/lib/auth";
import { classifyRequestHost, platformRoutesAllowedOnHost } from "@/platform/host";
import {
  AUDIT_ACTION,
  AUDIT_ACTOR_TYPE,
  AUDIT_CATEGORY,
  AUDIT_EVENT_KIND,
  AUDIT_SEVERITY,
} from "@/platform/forensics/constants";
import {
  auditFilterSummary,
  queryPlatformAuditEvents,
  tryAppendPlatformAuditEvent,
  type PlatformAuditQuery,
} from "@/platform/forensics/platform-audit-service";
import { markForensicSecurityDenied, mergeForensicContext, setForensicActor } from "@/platform/forensics/request-context";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

function parseDate(value: string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function filtersFromSearch(search: URLSearchParams): PlatformAuditQuery {
  return {
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
    tenantId: search.get("tenantId") ?? undefined,
    restaurantId: search.get("restaurantId") ?? undefined,
    branchId: search.get("branchId") ?? undefined,
    resourceType: search.get("resourceType") ?? undefined,
    resourceId: search.get("resourceId") ?? undefined,
    requestId: search.get("requestId") ?? undefined,
    correlationId: search.get("correlationId") ?? undefined,
    errorCode: search.get("errorCode") ?? undefined,
    q: search.get("q") ?? undefined,
    cursor: search.get("cursor"),
    limit: search.get("limit") ? Number(search.get("limit")) : 50,
  };
}

async function denyAuditAccess(reason: string) {
  markForensicSecurityDenied();
  void tryAppendPlatformAuditEvent({
    eventKind: AUDIT_EVENT_KIND.SECURITY,
    severity: AUDIT_SEVERITY.WARN,
    category: AUDIT_CATEGORY.SECURITY,
    action: AUDIT_ACTION.PLATFORM_AUDIT_ACCESS_DENIED,
    outcome: "DENIED",
    metadata: { reason },
  });
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

async function handleGET(req: NextRequest) {
  mergeForensicContext({ suppressRequestEvent: true });
  if (!platformRoutesAllowedOnHost(classifyRequestHost(req.headers))) {
    return denyAuditAccess("host");
  }
  const requestAdmin = req.cookies.get(PLATFORM_ADMIN_COOKIE)?.value
    ? await verifyPlatformAdminToken(req.cookies.get(PLATFORM_ADMIN_COOKIE)!.value)
    : null;
  const admin = requestAdmin ?? (await requirePlatformAdmin());
  if (!admin) {
    return denyAuditAccess("unauthenticated");
  }
  setForensicActor({
    type: AUDIT_ACTOR_TYPE.PLATFORM_ADMIN,
    id: admin.id,
    name: admin.name,
    role: "PLATFORM_ADMIN",
  });
  const filters = filtersFromSearch(req.nextUrl.searchParams);
  const result = await queryPlatformAuditEvents(filters);
  await tryAppendPlatformAuditEvent({
    category: AUDIT_CATEGORY.PLATFORM,
    action: AUDIT_ACTION.AUDIT_VIEWED,
    actorType: AUDIT_ACTOR_TYPE.PLATFORM_ADMIN,
    actorId: admin.id,
    actorName: admin.name,
    actorRole: "PLATFORM_ADMIN",
    metadata: { filters: auditFilterSummary(filters) },
  });
  return NextResponse.json(result);
}

async function handleTamper(req: NextRequest) {
  mergeForensicContext({ suppressRequestEvent: true });
  const requestAdmin = req.cookies.get(PLATFORM_ADMIN_COOKIE)?.value
    ? await verifyPlatformAdminToken(req.cookies.get(PLATFORM_ADMIN_COOKIE)!.value)
    : null;
  const admin = requestAdmin ?? (await requirePlatformAdmin());
  if (admin) {
    setForensicActor({
      type: AUDIT_ACTOR_TYPE.PLATFORM_ADMIN,
      id: admin.id,
      name: admin.name,
      role: "PLATFORM_ADMIN",
    });
  }
  markForensicSecurityDenied();
  void tryAppendPlatformAuditEvent({
    eventKind: AUDIT_EVENT_KIND.SECURITY,
    severity: AUDIT_SEVERITY.CRITICAL,
    category: AUDIT_CATEGORY.SECURITY,
    action: AUDIT_ACTION.AUDIT_TAMPER_ATTEMPT,
    outcome: "DENIED",
    httpMethod: req.method,
    metadata: { method: req.method },
  });
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export const GET = withForensicApiRoute(handleGET, { suppressRequestEvent: true });
export const POST = withForensicApiRoute(handleTamper, { suppressRequestEvent: true });
export const PUT = withForensicApiRoute(handleTamper, { suppressRequestEvent: true });
export const PATCH = withForensicApiRoute(handleTamper, { suppressRequestEvent: true });
export const DELETE = withForensicApiRoute(handleTamper, { suppressRequestEvent: true });

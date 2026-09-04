import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";
import {
  AUDIT_ACTION,
  AUDIT_CATEGORY,
  AUDIT_EVENT_KIND,
  AUDIT_OUTCOME,
  AUDIT_SEVERITY,
  AUDIT_SOURCE,
  FORENSIC_LIMITS,
} from "@/platform/forensics/constants";
import { safeAuditDiff } from "@/platform/forensics/diff";
import { forensicErrorFingerprint } from "@/platform/forensics/error-fingerprint";
import { redactSecrets, sanitizeErrorText } from "@/platform/forensics/redactor";
import { getForensicContext } from "@/platform/forensics/request-context";
import { boundString, parseAuditJson, serializeAuditJson } from "@/platform/forensics/serialize";

export type AuditWriteInput = {
  eventKind?: string;
  severity?: string;
  source?: string;
  category: string;
  action: string;
  outcome?: string;
  occurredAt?: Date;
  requestId?: string | null;
  correlationId?: string | null;
  actorType?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  actorSessionId?: string | null;
  tenantId?: string | null;
  restaurantId?: string | null;
  branchId?: string | null;
  floorId?: string | null;
  hostname?: string | null;
  clientIp?: string | null;
  clientIpSource?: string | null;
  forwardedFor?: string | null;
  userAgent?: string | null;
  httpMethod?: string | null;
  route?: string | null;
  httpStatus?: number | null;
  durationMs?: number | null;
  resourceType?: string | null;
  resourceId?: string | null;
  resourceLabel?: string | null;
  before?: unknown;
  after?: unknown;
  diff?: unknown;
  metadata?: Record<string, unknown> | null;
  errorType?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  error?: unknown;
};

export type AuditTx = {
  platformAuditEvent: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
};

function contextDefaults() {
  const ctx = getForensicContext();
  if (!ctx) return {};
  return {
    requestId: ctx.requestId,
    correlationId: ctx.correlationId ?? null,
    actorType: ctx.actor?.type ?? null,
    actorId: ctx.actor?.id ?? null,
    actorName: ctx.actor?.name ?? null,
    actorRole: ctx.actor?.role ?? null,
    actorSessionId: ctx.actor?.sessionId ?? null,
    tenantId: ctx.tenant?.tenantId ?? null,
    restaurantId: ctx.tenant?.restaurantId ?? null,
    branchId: ctx.tenant?.branchId ?? null,
    floorId: ctx.tenant?.floorId ?? null,
    hostname: ctx.hostname ?? null,
    clientIp: ctx.clientIp ?? null,
    clientIpSource: ctx.clientIpSource ?? null,
    forwardedFor: ctx.forwardedFor ?? null,
    userAgent: ctx.userAgent ?? null,
    httpMethod: ctx.method ?? null,
    route: ctx.routeTemplate ?? null,
    resourceType: ctx.resource?.type ?? null,
    resourceId: ctx.resource?.id ?? null,
    resourceLabel: ctx.resource?.label ?? null,
    source: ctx.source ?? AUDIT_SOURCE.API,
  };
}

function errorFields(input: AuditWriteInput) {
  const err = input.error;
  const errorType =
    input.errorType ??
    (err instanceof Error ? err.name : err != null ? "Error" : null);
  const errorMessage = sanitizeErrorText(
    input.errorMessage ?? (err instanceof Error ? err.message : err != null ? String(err) : null),
    FORENSIC_LIMITS.errorMessage,
  );
  const errorCode = boundString(input.errorCode, 80);
  return {
    errorType: boundString(errorType, 80),
    errorCode,
    errorMessage,
    errorFingerprint:
      errorType || errorCode || errorMessage
        ? forensicErrorFingerprint({
            errorType,
            errorCode,
            message: errorMessage,
            route: input.route ?? getForensicContext()?.routeTemplate,
          })
        : null,
  };
}

export function buildPlatformAuditEventData(input: AuditWriteInput) {
  const defaults = contextDefaults();
  const before = input.before === undefined ? undefined : redactSecrets(input.before);
  const after = input.after === undefined ? undefined : redactSecrets(input.after);
  const diff =
    input.diff === undefined
      ? before !== undefined && after !== undefined
        ? safeAuditDiff(before, after)
        : undefined
      : redactSecrets(input.diff);

  const occurredAt = input.occurredAt ?? new Date();
  const recordedAt = new Date();
  const errors = errorFields(input);

  return {
    occurredAt,
    recordedAt,
    eventKind: input.eventKind ?? AUDIT_EVENT_KIND.ACTION,
    severity: input.severity ?? AUDIT_SEVERITY.INFO,
    source: input.source ?? defaults.source ?? AUDIT_SOURCE.API,
    category: input.category,
    action: input.action,
    outcome: input.outcome ?? AUDIT_OUTCOME.SUCCESS,
    requestId: input.requestId ?? defaults.requestId ?? null,
    correlationId: input.correlationId ?? defaults.correlationId ?? null,
    actorType: input.actorType ?? defaults.actorType ?? null,
    actorId: input.actorId ?? defaults.actorId ?? null,
    actorName: boundString(input.actorName ?? defaults.actorName, FORENSIC_LIMITS.actorName),
    actorRole: input.actorRole ?? defaults.actorRole ?? null,
    actorSessionId: input.actorSessionId ?? defaults.actorSessionId ?? null,
    tenantId: input.tenantId ?? defaults.tenantId ?? null,
    restaurantId: input.restaurantId ?? defaults.restaurantId ?? null,
    branchId: input.branchId ?? defaults.branchId ?? null,
    floorId: input.floorId ?? defaults.floorId ?? null,
    hostname: boundString(input.hostname ?? defaults.hostname, FORENSIC_LIMITS.hostname),
    clientIp: input.clientIp ?? defaults.clientIp ?? null,
    clientIpSource: input.clientIpSource ?? defaults.clientIpSource ?? null,
    forwardedFor: boundString(input.forwardedFor ?? defaults.forwardedFor, FORENSIC_LIMITS.forwardedFor),
    userAgent: boundString(input.userAgent ?? defaults.userAgent, FORENSIC_LIMITS.userAgent),
    httpMethod: input.httpMethod ?? defaults.httpMethod ?? null,
    route: boundString(input.route ?? defaults.route, FORENSIC_LIMITS.route),
    httpStatus: input.httpStatus ?? null,
    durationMs: input.durationMs ?? null,
    resourceType: input.resourceType ?? defaults.resourceType ?? null,
    resourceId: input.resourceId ?? defaults.resourceId ?? null,
    resourceLabel: boundString(input.resourceLabel ?? defaults.resourceLabel, FORENSIC_LIMITS.resourceLabel),
    beforeJson: serializeAuditJson(before, FORENSIC_LIMITS.jsonField),
    afterJson: serializeAuditJson(after, FORENSIC_LIMITS.jsonField),
    diffJson: serializeAuditJson(diff && Object.keys(diff as object).length ? diff : null, FORENSIC_LIMITS.jsonField),
    metadataJson: serializeAuditJson(input.metadata ? redactSecrets(input.metadata) : null, FORENSIC_LIMITS.jsonField),
    ...errors,
  };
}

function logWriteFailure(input: AuditWriteInput, error: unknown) {
  logError("forensics", AUDIT_ACTION.FORENSIC_AUDIT_WRITE_FAILED, {
    category: input.category,
    action: input.action,
    requestId: input.requestId ?? getForensicContext()?.requestId ?? null,
    correlationId: input.correlationId ?? getForensicContext()?.correlationId ?? null,
    errorType: error instanceof Error ? error.name : "Error",
    errorMessage: sanitizeErrorText(error),
  });
}

export async function appendPlatformAuditEventInTx(tx: AuditTx, input: AuditWriteInput) {
  const data = buildPlatformAuditEventData(input);
  await tx.platformAuditEvent.create({ data });
  return data;
}

export async function appendPlatformAuditEvent(input: AuditWriteInput) {
  return appendPlatformAuditEventInTx(prisma, input);
}

export async function tryAppendPlatformAuditEvent(input: AuditWriteInput) {
  try {
    return await appendPlatformAuditEvent(input);
  } catch (error) {
    logWriteFailure(input, error);
    return null;
  }
}

export async function recordSemanticAudit(
  input: AuditWriteInput & { critical?: boolean; tx?: AuditTx },
) {
  if (input.tx) {
    return appendPlatformAuditEventInTx(input.tx, input);
  }
  if (input.critical) {
    return appendPlatformAuditEvent(input);
  }
  return tryAppendPlatformAuditEvent(input);
}

export type PlatformAuditQuery = {
  from?: Date;
  to?: Date;
  eventKind?: string;
  severity?: string;
  category?: string;
  action?: string;
  outcome?: string;
  actorType?: string;
  actorId?: string;
  actorRole?: string;
  actorName?: string;
  clientIp?: string;
  hostname?: string;
  tenantId?: string;
  restaurantId?: string;
  branchId?: string;
  resourceType?: string;
  resourceId?: string;
  requestId?: string;
  correlationId?: string;
  errorCode?: string;
  q?: string;
  cursor?: string | null;
  limit?: number;
};

function decodeCursor(cursor?: string | null) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      occurredAt: string;
      id: string;
    };
    if (!parsed.occurredAt || !parsed.id) return null;
    return { occurredAt: new Date(parsed.occurredAt), id: parsed.id };
  } catch {
    return null;
  }
}

function encodeCursor(row: { occurredAt: Date; id: string }) {
  return Buffer.from(JSON.stringify({ occurredAt: row.occurredAt.toISOString(), id: row.id }), "utf8").toString(
    "base64url",
  );
}

export async function queryPlatformAuditEvents(query: PlatformAuditQuery) {
  const take = Math.min(Math.max(query.limit ?? 50, 1), 100);
  const cursor = decodeCursor(query.cursor);
  const where: Record<string, unknown> = {};

  if (query.from || query.to) {
    where.occurredAt = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }
  if (query.eventKind) where.eventKind = query.eventKind;
  if (query.severity) where.severity = query.severity;
  if (query.category) where.category = query.category;
  if (query.action) where.action = query.action;
  if (query.outcome) where.outcome = query.outcome;
  if (query.actorType) where.actorType = query.actorType;
  if (query.actorId) where.actorId = query.actorId;
  if (query.actorRole) where.actorRole = query.actorRole;
  if (query.actorName) where.actorName = query.actorName;
  if (query.clientIp) where.clientIp = query.clientIp;
  if (query.hostname) where.hostname = query.hostname;
  if (query.tenantId) where.tenantId = query.tenantId;
  if (query.restaurantId) where.restaurantId = query.restaurantId;
  if (query.branchId) where.branchId = query.branchId;
  if (query.resourceType) where.resourceType = query.resourceType;
  if (query.resourceId) where.resourceId = query.resourceId;
  if (query.requestId) where.requestId = query.requestId;
  if (query.correlationId) where.correlationId = query.correlationId;
  if (query.errorCode) where.errorCode = query.errorCode;
  const and: Record<string, unknown>[] = [];
  if (query.q) {
    const q = query.q.trim();
    if (q) {
      and.push({
        OR: [
          { action: q },
          { requestId: q },
          { correlationId: q },
          { resourceId: q },
          { actorId: q },
          { clientIp: q },
          { errorCode: q },
        ],
      });
    }
  }
  if (cursor) {
    and.push({
      OR: [
        { occurredAt: { lt: cursor.occurredAt } },
        { AND: [{ occurredAt: cursor.occurredAt }, { id: { lt: cursor.id } }] },
      ],
    });
  }
  if (and.length) where.AND = and;

  const rows = await prisma.platformAuditEvent.findMany({
    where,
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: take + 1,
  });
  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  return {
    events: page.map(publicPlatformAuditEvent),
    nextCursor: hasMore && page.length ? encodeCursor(page[page.length - 1]!) : null,
  };
}

export function publicPlatformAuditEvent(row: {
  id: string;
  occurredAt: Date;
  recordedAt: Date;
  eventKind: string;
  severity: string;
  source: string;
  category: string;
  action: string;
  outcome: string;
  requestId: string | null;
  correlationId: string | null;
  actorType: string | null;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  actorSessionId: string | null;
  tenantId: string | null;
  restaurantId: string | null;
  branchId: string | null;
  floorId: string | null;
  hostname: string | null;
  clientIp: string | null;
  clientIpSource: string | null;
  forwardedFor: string | null;
  userAgent: string | null;
  httpMethod: string | null;
  route: string | null;
  httpStatus: number | null;
  durationMs: number | null;
  resourceType: string | null;
  resourceId: string | null;
  resourceLabel: string | null;
  beforeJson: string | null;
  afterJson: string | null;
  diffJson: string | null;
  metadataJson: string | null;
  errorType: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  errorFingerprint: string | null;
}) {
  return {
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    recordedAt: row.recordedAt.toISOString(),
    eventKind: row.eventKind,
    severity: row.severity,
    source: row.source,
    category: row.category,
    action: row.action,
    outcome: row.outcome,
    requestId: row.requestId,
    correlationId: row.correlationId,
    actorType: row.actorType,
    actorId: row.actorId,
    actorName: row.actorName,
    actorRole: row.actorRole,
    actorSessionId: row.actorSessionId,
    tenantId: row.tenantId,
    restaurantId: row.restaurantId,
    branchId: row.branchId,
    floorId: row.floorId,
    hostname: row.hostname,
    clientIp: row.clientIp,
    clientIpSource: row.clientIpSource,
    forwardedFor: row.forwardedFor,
    userAgent: row.userAgent,
    httpMethod: row.httpMethod,
    route: row.route,
    httpStatus: row.httpStatus,
    durationMs: row.durationMs,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    resourceLabel: row.resourceLabel,
    before: parseAuditJson(row.beforeJson),
    after: parseAuditJson(row.afterJson),
    diff: parseAuditJson(row.diffJson),
    metadata: parseAuditJson(row.metadataJson),
    errorType: row.errorType,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    errorFingerprint: row.errorFingerprint,
  };
}

export function auditFilterSummary(query: PlatformAuditQuery) {
  return redactSecrets({
    from: query.from?.toISOString() ?? null,
    to: query.to?.toISOString() ?? null,
    eventKind: query.eventKind ?? null,
    severity: query.severity ?? null,
    category: query.category ?? null,
    action: query.action ?? null,
    outcome: query.outcome ?? null,
    actorType: query.actorType ?? null,
    actorId: query.actorId ?? null,
    actorRole: query.actorRole ?? null,
    actorName: query.actorName ?? null,
    clientIp: query.clientIp ?? null,
    hostname: query.hostname ?? null,
    tenantId: query.tenantId ?? null,
    restaurantId: query.restaurantId ?? null,
    resourceType: query.resourceType ?? null,
    resourceId: query.resourceId ?? null,
    requestId: query.requestId ?? null,
    correlationId: query.correlationId ?? null,
    errorCode: query.errorCode ?? null,
    q: query.q ?? null,
  });
}

export { AUDIT_ACTION, AUDIT_CATEGORY, AUDIT_EVENT_KIND, AUDIT_OUTCOME, AUDIT_SEVERITY, AUDIT_SOURCE };

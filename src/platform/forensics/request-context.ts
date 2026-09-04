import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { AuditActorType } from "@/platform/forensics/constants";

export type ForensicActor = {
  type: AuditActorType;
  id?: string | null;
  name?: string | null;
  role?: string | null;
  sessionId?: string | null;
};

export type ForensicTenant = {
  tenantId?: string | null;
  restaurantId?: string | null;
  branchId?: string | null;
  floorId?: string | null;
};

export type ForensicResource = {
  type?: string | null;
  id?: string | null;
  label?: string | null;
};

export type ForensicRequestContext = {
  requestId: string;
  correlationId?: string | null;
  startedAt: number;
  method?: string | null;
  routeTemplate?: string | null;
  hostname?: string | null;
  clientIp?: string | null;
  clientIpSource?: string | null;
  forwardedFor?: string | null;
  userAgent?: string | null;
  actor?: ForensicActor | null;
  tenant?: ForensicTenant | null;
  resource?: ForensicResource | null;
  source?: string | null;
  suppressRequestEvent?: boolean;
  securityDenied?: boolean;
};

const storage = new AsyncLocalStorage<ForensicRequestContext>();

export function generateRequestId() {
  return randomUUID();
}

export function getForensicContext(): ForensicRequestContext | undefined {
  return storage.getStore();
}

export function runWithForensicContext<T>(
  context: ForensicRequestContext,
  fn: () => T,
): T {
  return storage.run(context, fn);
}

export function mergeForensicContext(patch: Partial<ForensicRequestContext>) {
  const current = storage.getStore();
  if (!current) return;
  Object.assign(current, patch);
}

export function setForensicActor(actor: ForensicActor | null | undefined) {
  const current = storage.getStore();
  if (!current || !actor) return;
  current.actor = { ...current.actor, ...actor };
}

export function setForensicTenant(tenant: ForensicTenant | null | undefined) {
  const current = storage.getStore();
  if (!current || !tenant) return;
  current.tenant = { ...current.tenant, ...tenant };
}

export function setForensicResource(resource: ForensicResource | null | undefined) {
  const current = storage.getStore();
  if (!current || !resource) return;
  current.resource = { ...current.resource, ...resource };
}

export function setForensicCorrelationId(correlationId: string | null | undefined) {
  const current = storage.getStore();
  if (!current || !correlationId) return;
  current.correlationId = correlationId;
}

export function markForensicSecurityDenied() {
  const current = storage.getStore();
  if (!current) return;
  current.securityDenied = true;
}

export function forensicContextIds() {
  const current = storage.getStore();
  if (!current) return {};
  return {
    requestId: current.requestId,
    ...(current.correlationId ? { correlationId: current.correlationId } : {}),
  };
}

export function runWithWorkerForensicContext<T>(label: string, fn: () => T): T {
  return runWithForensicContext(
    {
      requestId: generateRequestId(),
      startedAt: Date.now(),
      source: "WORKER",
      actor: { type: "SYSTEM", name: label },
      method: null,
      routeTemplate: label,
    },
    fn,
  );
}

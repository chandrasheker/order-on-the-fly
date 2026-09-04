"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { Button, Card, Input, Spinner } from "@/components/ui";

type AuditEvent = {
  id: string;
  occurredAt: string;
  recordedAt: string;
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
  hostname: string | null;
  clientIp: string | null;
  clientIpSource: string | null;
  userAgent: string | null;
  httpMethod: string | null;
  route: string | null;
  httpStatus: number | null;
  durationMs: number | null;
  resourceType: string | null;
  resourceId: string | null;
  resourceLabel: string | null;
  before: unknown;
  after: unknown;
  diff: unknown;
  metadata: unknown;
  errorType: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  errorFingerprint: string | null;
};

const EMPTY_FILTERS = {
  from: "",
  to: "",
  category: "",
  action: "",
  outcome: "",
  actorName: "",
  actorRole: "",
  clientIp: "",
  hostname: "",
  restaurantId: "",
  tenantId: "",
  resourceType: "",
  resourceId: "",
  requestId: "",
  correlationId: "",
  errorCode: "",
};

function tone(event: AuditEvent) {
  if (event.severity === "CRITICAL" || event.outcome === "FAILED") return "bg-red-500/15 text-red-300";
  if (event.outcome === "DENIED" || event.severity === "WARN") return "bg-amber-500/15 text-amber-300";
  return "bg-emerald-500/10 text-emerald-300";
}

export function PlatformAuditConsole({ admin }: { admin: { name: string; email: string } }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AuditEvent | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(applied)) {
      if (value) params.set(key, value);
    }
    return params;
  }, [applied]);

  const applyFilter = (patch: Partial<typeof EMPTY_FILTERS>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setApplied((current) => ({ ...current, ...patch }));
  };

  const load = useCallback(
    async (nextCursor?: string | null, reset = false) => {
      setLoading(true);
      const params = new URLSearchParams(query);
      if (nextCursor) params.set("cursor", nextCursor);
      const res = await fetch(`/api/platform/audit?${params.toString()}`);
      if (!res.ok) {
        setEvents([]);
        setLoading(false);
        return;
      }
      const json = (await res.json()) as { events: AuditEvent[]; nextCursor: string | null };
      setEvents((prev) => (reset ? json.events : [...prev, ...json.events]));
      setCursor(json.nextCursor);
      setLoading(false);
    },
    [query],
  );

  useEffect(() => {
    void load(null, true);
  }, [load]);

  return (
    <PlatformShell
      admin={admin}
      title="Forensic audit"
      subtitle="Platform-wide activity, security, money, and print evidence"
      backHref="/platform"
      backLabel="Tenants"
    >
      <div className="max-w-6xl mx-auto space-y-4">
        <Card className="p-4 grid gap-3 md:grid-cols-4">
          <Input value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} placeholder="From (ISO)" aria-label="From" />
          <Input value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} placeholder="To (ISO)" aria-label="To" />
          <Input value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))} placeholder="Category" aria-label="Category" />
          <Input value={filters.action} onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))} placeholder="Action" aria-label="Action" />
          <Input value={filters.outcome} onChange={(e) => setFilters((f) => ({ ...f, outcome: e.target.value }))} placeholder="Outcome" aria-label="Outcome" />
          <Input value={filters.actorName} onChange={(e) => setFilters((f) => ({ ...f, actorName: e.target.value }))} placeholder="Actor name" aria-label="Actor name" />
          <Input value={filters.actorRole} onChange={(e) => setFilters((f) => ({ ...f, actorRole: e.target.value }))} placeholder="Actor role" aria-label="Actor role" />
          <Input value={filters.clientIp} onChange={(e) => setFilters((f) => ({ ...f, clientIp: e.target.value }))} placeholder="Client IP" aria-label="Client IP" />
          <Input value={filters.hostname} onChange={(e) => setFilters((f) => ({ ...f, hostname: e.target.value }))} placeholder="Hostname" aria-label="Hostname" />
          <Input value={filters.tenantId} onChange={(e) => setFilters((f) => ({ ...f, tenantId: e.target.value }))} placeholder="Tenant ID" aria-label="Tenant ID" />
          <Input value={filters.restaurantId} onChange={(e) => setFilters((f) => ({ ...f, restaurantId: e.target.value }))} placeholder="Restaurant ID" aria-label="Restaurant ID" />
          <Input value={filters.resourceType} onChange={(e) => setFilters((f) => ({ ...f, resourceType: e.target.value }))} placeholder="Resource type" aria-label="Resource type" />
          <Input value={filters.resourceId} onChange={(e) => setFilters((f) => ({ ...f, resourceId: e.target.value }))} placeholder="Resource ID" aria-label="Resource ID" />
          <Input value={filters.requestId} onChange={(e) => setFilters((f) => ({ ...f, requestId: e.target.value }))} placeholder="Request ID" aria-label="Request ID" />
          <Input value={filters.correlationId} onChange={(e) => setFilters((f) => ({ ...f, correlationId: e.target.value }))} placeholder="Correlation ID" aria-label="Correlation ID" />
          <Input value={filters.errorCode} onChange={(e) => setFilters((f) => ({ ...f, errorCode: e.target.value }))} placeholder="Error code" aria-label="Error code" />
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setApplied({ ...filters });
                setSelected(null);
              }}
            >
              Apply
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setFilters(EMPTY_FILTERS);
                setApplied(EMPTY_FILTERS);
                setSelected(null);
              }}
            >
              Clear
            </Button>
          </div>
        </Card>

        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-left text-zinc-400">
              <tr>
                <th className="px-3 py-2">Timestamp</th>
                <th className="px-3 py-2">Severity</th>
                <th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">IP</th>
                <th className="px-3 py-2">Host</th>
                <th className="px-3 py-2">Restaurant</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Resource</th>
                <th className="px-3 py-2">Outcome</th>
                <th className="px-3 py-2">HTTP</th>
                <th className="px-3 py-2">Request</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr
                  key={event.id}
                  className="border-t border-white/5 hover:bg-white/5 cursor-pointer"
                  onClick={() => setSelected(event)}
                >
                  <td className="px-3 py-2 whitespace-nowrap">{event.occurredAt}</td>
                  <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-lg ${tone(event)}`}>{event.severity}</span></td>
                  <td className="px-3 py-2">{event.actorName ?? event.actorType ?? "—"}</td>
                  <td className="px-3 py-2">{event.actorRole ?? "—"}</td>
                  <td className="px-3 py-2">{event.clientIp ?? "—"}</td>
                  <td className="px-3 py-2">{event.hostname ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{event.restaurantId ?? "—"}</td>
                  <td className="px-3 py-2">{event.category}</td>
                  <td className="px-3 py-2">{event.action}</td>
                  <td className="px-3 py-2">{event.resourceType ?? "—"} {event.resourceId ? event.resourceId.slice(0, 8) : ""}</td>
                  <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-lg ${tone(event)}`}>{event.outcome}</span></td>
                  <td className="px-3 py-2">{event.httpStatus ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{event.requestId ? event.requestId.slice(0, 8) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && (
            <div className="p-6 flex justify-center"><Spinner className="w-6 h-6" /></div>
          )}
          {!loading && events.length === 0 && (
            <p className="p-6 text-center text-zinc-500">No forensic events match these filters.</p>
          )}
        </div>

        {cursor && (
          <Button variant="secondary" onClick={() => void load(cursor)}>Load more</Button>
        )}

        {selected && (
          <Card className="p-4 space-y-3">
            <div className="flex justify-between gap-3">
              <h2 className="text-lg font-semibold">Event detail</h2>
              <Button variant="secondary" size="sm" onClick={() => setSelected(null)}>Close</Button>
            </div>
            <dl className="grid md:grid-cols-2 gap-2 text-sm">
              <div><dt className="text-zinc-500">Occurred (UTC)</dt><dd>{selected.occurredAt}</dd></div>
              <div><dt className="text-zinc-500">Recorded (UTC)</dt><dd>{selected.recordedAt}</dd></div>
              <div>
                <dt className="text-zinc-500">Actor</dt>
                <dd>
                  <button className="text-violet-300" onClick={() => applyFilter({ actorName: selected.actorName ?? "", actorRole: selected.actorRole ?? "" })}>
                    {selected.actorType} {selected.actorName} {selected.actorRole}
                  </button>
                </dd>
              </div>
              <div><dt className="text-zinc-500">Session</dt><dd className="font-mono text-xs">{selected.actorSessionId ?? "—"}</dd></div>
              <div>
                <dt className="text-zinc-500">IP</dt>
                <dd>
                  <button className="text-violet-300" onClick={() => applyFilter({ clientIp: selected.clientIp ?? "" })}>
                    {selected.clientIp ?? "—"}
                  </button>
                  {" "}({selected.clientIpSource ?? "—"})
                </dd>
              </div>
              <div><dt className="text-zinc-500">Host</dt><dd>{selected.hostname ?? "—"}</dd></div>
              <div>
                <dt className="text-zinc-500">Restaurant</dt>
                <dd>
                  <button className="font-mono text-xs text-violet-300" onClick={() => applyFilter({ restaurantId: selected.restaurantId ?? "", tenantId: selected.tenantId ?? "" })}>
                    {selected.restaurantId ?? "—"}
                  </button>
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Resource</dt>
                <dd>
                  <button className="font-mono text-xs text-violet-300" onClick={() => applyFilter({ resourceType: selected.resourceType ?? "", resourceId: selected.resourceId ?? "" })}>
                    {selected.resourceType ?? "—"} {selected.resourceId ?? ""}
                  </button>
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Request ID</dt>
                <dd>
                  <button className="font-mono text-xs text-violet-300" onClick={() => applyFilter({ requestId: selected.requestId ?? "" })}>
                    {selected.requestId ?? "—"}
                  </button>
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Correlation ID</dt>
                <dd>
                  <button className="font-mono text-xs text-violet-300" onClick={() => applyFilter({ correlationId: selected.correlationId ?? "" })}>
                    {selected.correlationId ?? "—"}
                  </button>
                </dd>
              </div>
              <div><dt className="text-zinc-500">HTTP</dt><dd>{selected.httpMethod} {selected.route} {selected.httpStatus} {selected.durationMs != null ? `${selected.durationMs}ms` : ""}</dd></div>
              <div><dt className="text-zinc-500">User agent</dt><dd className="break-all">{selected.userAgent ?? "—"}</dd></div>
              <div><dt className="text-zinc-500">Error</dt><dd>{selected.errorCode ?? selected.errorType ?? "—"} {selected.errorMessage ?? ""}</dd></div>
            </dl>
            <pre className="text-xs overflow-auto bg-black/30 p-3 rounded-xl">{JSON.stringify({ before: selected.before, after: selected.after, diff: selected.diff, metadata: selected.metadata }, null, 2)}</pre>
          </Card>
        )}
      </div>
    </PlatformShell>
  );
}

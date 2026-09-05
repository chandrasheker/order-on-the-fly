"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Select, Spinner } from "@/components/ui";
import { LOG_PRESETS, type LogPreset } from "@/platform/command-center/log-presets";
import { swallowPollingFetchError } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

export type ScopedAuditEvent = {
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
  restaurantId: string | null;
  hostname: string | null;
  clientIp: string | null;
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

type ErrorGroup = {
  fingerprint: string;
  count: number;
  latest: string | null;
  route: string | null;
  action: string | null;
  errorCode: string | null;
  restaurantId: string | null;
};

const PRESET_LABEL: Record<LogPreset, string> = {
  all: "All",
  access: "Access",
  activity: "Activity",
  auth: "Auth",
  security: "Security",
  errors: "Errors",
  payments: "Payments",
  printing: "Printing",
  config: "Configuration",
  system: "System",
};

const EMPTY_FILTERS = {
  from: "",
  to: "",
  actorName: "",
  actorRole: "",
  clientIp: "",
  action: "",
  outcome: "",
  requestId: "",
  correlationId: "",
  errorCode: "",
  errorFingerprint: "",
  q: "",
};

function tone(event: ScopedAuditEvent) {
  if (event.severity === "CRITICAL" || event.outcome === "FAILED") return "bg-red-500/15 text-red-300";
  if (event.outcome === "DENIED" || event.severity === "WARN") return "bg-amber-500/15 text-amber-300";
  return "bg-emerald-500/10 text-emerald-300";
}

export function PlatformScopedLogsConsole({
  endpoint,
  restaurants,
  restaurantId,
  onRestaurantId,
  initialPreset,
  initialFingerprint,
  failedOnly,
  ambiguousOnly,
  title,
  subtitle,
}: {
  endpoint: string;
  restaurants?: Array<{ id: string; name: string }>;
  restaurantId?: string;
  onRestaurantId?: (id: string) => void;
  initialPreset?: string;
  initialFingerprint?: string;
  failedOnly?: boolean;
  ambiguousOnly?: boolean;
  title?: string;
  subtitle?: string;
}) {
  const [preset, setPreset] = useState<LogPreset>(
    LOG_PRESETS.includes((initialPreset ?? "all") as LogPreset) ? (initialPreset as LogPreset) : "all",
  );
  const [filters, setFilters] = useState({
    ...EMPTY_FILTERS,
    errorFingerprint: initialFingerprint ?? "",
  });
  const [applied, setApplied] = useState({
    ...EMPTY_FILTERS,
    errorFingerprint: initialFingerprint ?? "",
  });
  const [events, setEvents] = useState<ScopedAuditEvent[]>([]);
  const [errorGroups, setErrorGroups] = useState<ErrorGroup[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ScopedAuditEvent | null>(null);
  const [failOnly, setFailOnly] = useState(Boolean(failedOnly));
  const [ambOnly, setAmbOnly] = useState(Boolean(ambiguousOnly));
  const [restaurantSearch, setRestaurantSearch] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("preset", preset);
    if (restaurantId) params.set("restaurantId", restaurantId);
    if (failOnly) params.set("failedOnly", "1");
    if (ambOnly) params.set("ambiguousOnly", "1");
    for (const [key, value] of Object.entries(applied)) {
      if (value) params.set(key, value);
    }
    return params;
  }, [applied, ambOnly, failOnly, preset, restaurantId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${endpoint}?${query.toString()}`);
      if (!res.ok) {
        setEvents([]);
        setErrorGroups([]);
        setCursor(null);
        return;
      }
      const json = (await res.json()) as {
        events: ScopedAuditEvent[];
        nextCursor: string | null;
        errorGroups?: ErrorGroup[] | null;
      };
      setEvents(json.events ?? []);
      setErrorGroups(json.errorGroups ?? []);
      setCursor(json.nextCursor);
    } catch (error) {
      swallowPollingFetchError(error);
    } finally {
      setLoading(false);
    }
  }, [endpoint, query]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- scoped log fetch
    void load();
  }, [load]);

  const loadMore = async () => {
    if (!cursor) return;
    const params = new URLSearchParams(query);
    params.set("cursor", cursor);
    const res = await fetch(`${endpoint}?${params.toString()}`);
    if (!res.ok) return;
    const json = (await res.json()) as { events: ScopedAuditEvent[]; nextCursor: string | null };
    setEvents((prev) => [...prev, ...json.events]);
    setCursor(json.nextCursor);
  };

  const accessView = preset === "access";
  const activityView = preset === "activity";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title ?? "Logs"}</h2>
        <p className="text-sm text-zinc-400">
          {subtitle ?? "Append-only forensic evidence. Filters change the view, not the dataset."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {LOG_PRESETS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setPreset(id);
              setSelected(null);
            }}
            className={cn(
              "px-3 py-1.5 rounded-xl text-sm border",
              preset === id ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-100" : "bg-white/5 border-white/10 text-zinc-400",
            )}
          >
            {PRESET_LABEL[id]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        {restaurants && onRestaurantId && (
          <div className="min-w-[220px]">
            <label className="text-xs text-zinc-500 block mb-1">Restaurant</label>
            {restaurants.length > 10 ? (
              <Input
                value={restaurantSearch}
                onChange={(e) => setRestaurantSearch(e.target.value)}
                placeholder="Search restaurants…"
                aria-label="Search restaurants"
                className="mb-2"
              />
            ) : null}
            <Select value={restaurantId ?? ""} onChange={(e) => onRestaurantId(e.target.value)} aria-label="Restaurant">
              <option value="">All restaurants</option>
              {restaurants
                .filter((restaurant) => {
                  const query = restaurantSearch.trim().toLowerCase();
                  if (!query) return true;
                  if (restaurant.id === restaurantId) return true;
                  return restaurant.name.toLowerCase().includes(query);
                })
                .map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>
                    {restaurant.name}
                  </option>
                ))}
            </Select>
          </div>
        )}
        <label className="text-sm text-zinc-400 inline-flex items-center gap-2">
          <input type="checkbox" checked={failOnly} onChange={(e) => setFailOnly(e.target.checked)} />
          Failed only
        </label>
        <label className="text-sm text-zinc-400 inline-flex items-center gap-2">
          <input type="checkbox" checked={ambOnly} onChange={(e) => setAmbOnly(e.target.checked)} />
          Ambiguous prints
        </label>
      </div>

      <Card className="p-4 grid gap-3 md:grid-cols-4">
        <Input value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} placeholder="From (ISO)" aria-label="From" />
        <Input value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} placeholder="To (ISO)" aria-label="To" />
        <Input value={filters.actorName} onChange={(e) => setFilters((f) => ({ ...f, actorName: e.target.value }))} placeholder="Actor" aria-label="Actor" />
        <Input value={filters.actorRole} onChange={(e) => setFilters((f) => ({ ...f, actorRole: e.target.value }))} placeholder="Role" aria-label="Role" />
        <Input value={filters.clientIp} onChange={(e) => setFilters((f) => ({ ...f, clientIp: e.target.value }))} placeholder="IP" aria-label="IP" />
        <Input value={filters.action} onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))} placeholder="Action" aria-label="Action" />
        <Input value={filters.requestId} onChange={(e) => setFilters((f) => ({ ...f, requestId: e.target.value }))} placeholder="Request ID" aria-label="Request ID" />
        <Input value={filters.correlationId} onChange={(e) => setFilters((f) => ({ ...f, correlationId: e.target.value }))} placeholder="Correlation ID" aria-label="Correlation ID" />
        <Input value={filters.errorFingerprint} onChange={(e) => setFilters((f) => ({ ...f, errorFingerprint: e.target.value }))} placeholder="Error fingerprint" aria-label="Error fingerprint" />
        <Input value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} placeholder="Exact id / action / IP" aria-label="Search" />
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
              setFailOnly(false);
              setAmbOnly(false);
              setSelected(null);
            }}
          >
            Clear
          </Button>
        </div>
      </Card>

      {preset === "errors" && errorGroups.length > 0 && (
        <Card className="p-4 space-y-2">
          <h3 className="font-medium">Error fingerprints</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-zinc-500">
                <tr>
                  <th className="text-left py-1 pr-3">Fingerprint</th>
                  <th className="text-left py-1 pr-3">Count</th>
                  <th className="text-left py-1 pr-3">Latest</th>
                  <th className="text-left py-1 pr-3">Route / action</th>
                  <th className="text-left py-1">Code</th>
                </tr>
              </thead>
              <tbody>
                {errorGroups.map((group) => (
                  <tr key={group.fingerprint}>
                    <td className="py-1 pr-3">
                      <button
                        type="button"
                        className="font-mono text-xs text-violet-300"
                        onClick={() => {
                          setFilters((f) => ({ ...f, errorFingerprint: group.fingerprint }));
                          setApplied((f) => ({ ...f, errorFingerprint: group.fingerprint }));
                        }}
                      >
                        {group.fingerprint.slice(0, 12)}
                      </button>
                    </td>
                    <td className="py-1 pr-3">{group.count}</td>
                    <td className="py-1 pr-3">{group.latest ?? "—"}</td>
                    <td className="py-1 pr-3">{group.route ?? group.action ?? "—"}</td>
                    <td className="py-1">{group.errorCode ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-white/5 text-left text-zinc-400">
            <tr>
              <th className="px-3 py-2">Timestamp</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">IP</th>
              {accessView ? (
                <>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Route</th>
                  <th className="px-3 py-2">HTTP</th>
                  <th className="px-3 py-2">Duration</th>
                </>
              ) : (
                <>
                  <th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Outcome</th>
                </>
              )}
              <th className="px-3 py-2">Restaurant</th>
              <th className="px-3 py-2">Resource</th>
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
                <td className="px-3 py-2">{event.actorName ?? event.actorType ?? "—"}</td>
                <td className="px-3 py-2">{event.actorRole ?? "—"}</td>
                <td className="px-3 py-2">{event.clientIp ?? "—"}</td>
                {accessView ? (
                  <>
                    <td className="px-3 py-2">{event.httpMethod ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{event.route ?? "—"}</td>
                    <td className="px-3 py-2">{event.httpStatus ?? "—"}</td>
                    <td className="px-3 py-2">{event.durationMs != null ? `${event.durationMs}ms` : "—"}</td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2">{event.eventKind}</td>
                    <td className="px-3 py-2">{event.action}</td>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-lg ${tone(event)}`}>{event.outcome}</span></td>
                  </>
                )}
                <td className="px-3 py-2 font-mono text-xs">{event.restaurantId ?? "—"}</td>
                <td className="px-3 py-2">{event.resourceLabel ?? event.resourceType ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{event.requestId ? event.requestId.slice(0, 8) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="p-6 flex justify-center"><Spinner className="w-6 h-6" /></div>}
        {!loading && events.length === 0 && (
          <p className="p-6 text-center text-zinc-500">No forensic events match this scope and filter.</p>
        )}
      </div>

      {cursor && (
        <Button variant="secondary" onClick={() => void loadMore()}>Load more</Button>
      )}

      {selected && (
        <Card className="p-4 space-y-3">
          <div className="flex justify-between gap-3">
            <h3 className="text-lg font-semibold">{activityView ? "Who changed what" : "Event detail"}</h3>
            <Button variant="secondary" size="sm" onClick={() => setSelected(null)}>Close</Button>
          </div>
          <dl className="grid md:grid-cols-2 gap-2 text-sm">
            <div><dt className="text-zinc-500">Occurred</dt><dd>{selected.occurredAt}</dd></div>
            <div><dt className="text-zinc-500">Actor</dt><dd>{selected.actorType} {selected.actorName} {selected.actorRole}</dd></div>
            <div><dt className="text-zinc-500">IP</dt><dd>{selected.clientIp ?? "—"}</dd></div>
            <div><dt className="text-zinc-500">Route</dt><dd className="font-mono text-xs">{selected.httpMethod} {selected.route} {selected.httpStatus}</dd></div>
            <div><dt className="text-zinc-500">Request ID</dt><dd className="font-mono text-xs">{selected.requestId ?? "—"}</dd></div>
            <div><dt className="text-zinc-500">Correlation ID</dt><dd className="font-mono text-xs">{selected.correlationId ?? "—"}</dd></div>
            <div><dt className="text-zinc-500">Resource</dt><dd>{selected.resourceType} {selected.resourceId}</dd></div>
            <div><dt className="text-zinc-500">Error</dt><dd>{selected.errorCode ?? selected.errorFingerprint ?? "—"} {selected.errorMessage ?? ""}</dd></div>
          </dl>
          <pre className="text-xs overflow-auto bg-black/30 p-3 rounded-xl">
            {JSON.stringify({ before: selected.before, after: selected.after, diff: selected.diff, metadata: selected.metadata }, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  );
}

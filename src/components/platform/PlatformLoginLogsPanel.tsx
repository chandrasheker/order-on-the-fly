"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Select } from "@/components/ui";
import { RefreshCw, Shield } from "lucide-react";
import { swallowPollingFetchError } from "@/lib/client-fetch";

type LoginLog = {
  id: string;
  kind: string;
  success: boolean;
  email: string;
  role: string | null;
  tenantId: string | null;
  restaurantId: string | null;
  failureReason: string | null;
  ipAddress: string | null;
  createdAt: string;
};

type RestaurantOption = { id: string; name: string };

export function PlatformLoginLogsPanel({
  tenantId,
  restaurants,
}: {
  tenantId: string;
  restaurants: RestaurantOption[];
}) {
  const [logs, setLogs] = useState<LoginLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [restaurantFilter, setRestaurantFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tenantId, limit: "150" });
      if (restaurantFilter) params.set("restaurantId", restaurantFilter);
      if (kindFilter) params.set("kind", kindFilter);
      const res = await fetch(`/api/platform/login-logs?${params}`);
      if (res.ok) {
        const json = await res.json();
        setLogs(json.logs ?? []);
      }
    } catch (error) {
      swallowPollingFetchError(error);
    } finally {
      setLoading(false);
    }
  }, [tenantId, restaurantFilter, kindFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Shield className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
        <div>
          <h2 className="font-semibold text-lg">Login audit log</h2>
          <p className="text-sm text-zinc-400">
            Who signed in, when, from where, and whether it succeeded — staff and platform admin
            logins for this tenant.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div className="min-w-[180px]">
          <label className="text-xs text-zinc-500 block mb-1">Restaurant</label>
          <Select
            value={restaurantFilter}
            onChange={(e) => setRestaurantFilter(e.target.value)}
          >
            <option value="">All restaurants</option>
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-[140px]">
          <label className="text-xs text-zinc-500 block mb-1">Kind</label>
          <Select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
            <option value="">All</option>
            <option value="STAFF">Staff</option>
            <option value="PLATFORM_ADMIN">Platform admin</option>
          </Select>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card className="overflow-hidden">
        {loading && logs.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500 text-center">Loading logs…</p>
        ) : logs.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500 text-center">No login events yet.</p>
        ) : (
          <div className="divide-y divide-white/5 max-h-[520px] overflow-y-auto">
            {logs.map((log) => (
              <div key={log.id} className="px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Badge
                    className={
                      log.success
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shrink-0"
                        : "bg-red-500/15 text-red-400 border-red-500/30 shrink-0"
                    }
                  >
                    {log.success ? "OK" : "Failed"}
                  </Badge>
                  <span className="font-medium truncate">{log.email}</span>
                  {log.role && (
                    <span className="text-xs text-zinc-500 shrink-0">{log.role}</span>
                  )}
                  <Badge className="bg-white/5 text-zinc-400 border-white/10 shrink-0">
                    {log.kind === "PLATFORM_ADMIN" ? "Admin" : "Staff"}
                  </Badge>
                </div>
                <div className="text-xs text-zinc-500 shrink-0 sm:text-right">
                  <p>{new Date(log.createdAt).toLocaleString()}</p>
                  {log.ipAddress && <p>{log.ipAddress}</p>}
                  {!log.success && log.failureReason && (
                    <p className="text-red-400">{log.failureReason}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

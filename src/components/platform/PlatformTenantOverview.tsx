"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Plus, ChevronDown, ChevronUp, Layers, Users } from "lucide-react";
import { Button, Card, Input, Badge } from "@/components/ui";
import { PlatformRestaurantToolbar } from "@/components/platform/PlatformRestaurantToolbar";
import { useRestaurantSearch } from "@/hooks/useRestaurantSearch";
import { isClientOffline, swallowPollingFetchError } from "@/lib/client-fetch";

type ActiveSessions = {
  total: number;
  byRole: { OWNER: number; MANAGER: number; COOK: number; SERVER: number };
  users: Array<{ name: string; email: string; role: string; lastSeenAt: string }>;
};

type TenantRestaurant = {
  id: string;
  name: string;
  slug: string;
  isEnabled?: boolean;
  branches: Array<{ id: string; name: string; slug: string; floors: Array<{ name: string }> }>;
  _count: { users: number; orders: number; tables: number };
  activeSessions?: ActiveSessions;
};

interface PlatformTenantOverviewProps {
  tenantId: string;
  tenantName: string;
  tenantEnabled: boolean;
  restaurants: TenantRestaurant[];
  onRestaurantsChange: () => void;
  onTenantToggle: (enabled: boolean) => Promise<void>;
  togglingTenant: boolean;
}

function roleSummary(byRole: ActiveSessions["byRole"]) {
  const parts: string[] = [];
  if (byRole.OWNER) parts.push(`${byRole.OWNER} owner${byRole.OWNER > 1 ? "s" : ""}`);
  if (byRole.MANAGER) parts.push(`${byRole.MANAGER} manager${byRole.MANAGER > 1 ? "s" : ""}`);
  if (byRole.COOK) parts.push(`${byRole.COOK} cook${byRole.COOK > 1 ? "s" : ""}`);
  if (byRole.SERVER) parts.push(`${byRole.SERVER} server${byRole.SERVER > 1 ? "s" : ""}`);
  return parts.length ? parts.join(", ") : "Nobody logged in";
}

export function PlatformTenantOverview({
  tenantId,
  tenantName,
  tenantEnabled,
  restaurants,
  onRestaurantsChange,
  onTenantToggle,
  togglingTenant,
}: PlatformTenantOverviewProps) {
  const [overview, setOverview] = useState<{
    stats?: Record<string, number>;
    restaurants?: TenantRestaurant[];
  } | null>(null);
  const [addRestaurant, setAddRestaurant] = useState({
    name: "",
    slug: "",
    ownerEmail: "",
    ownerName: "Owner",
  });
  const [message, setMessage] = useState("");
  const [togglingRestaurantId, setTogglingRestaurantId] = useState<string | null>(null);

  const mergedRestaurants = (overview?.restaurants ?? restaurants).map((r) => {
    const base = restaurants.find((b) => b.id === r.id) ?? r;
    return { ...base, ...r, branches: base.branches ?? r.branches };
  });

  const {
    search,
    setSearch,
    filtered: filteredRestaurants,
    isExpanded,
    toggleExpanded,
    expandAll,
    collapseAll,
    total,
    showing,
  } = useRestaurantSearch(mergedRestaurants);

  const loadOverview = useCallback(async () => {
    if (isClientOffline()) return;
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/overview`, {
        cache: "no-store",
      });
      if (res.ok) {
        setOverview(await res.json());
      }
    } catch (error) {
      swallowPollingFetchError(error);
    }
  }, [tenantId]);

  useEffect(() => {
    void loadOverview();
    const interval = setInterval(() => void loadOverview(), 30_000);
    return () => clearInterval(interval);
  }, [loadOverview]);

  useEffect(() => {
    void loadOverview();
  }, [tenantEnabled, loadOverview]);

  const submitRestaurant = async () => {
    setMessage("");
    try {
      const res = await fetch("/api/platform/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_restaurant",
          tenantId,
          ...addRestaurant,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error || "Failed");
        return;
      }
      setMessage(`Added ${json.restaurant.name}`);
      setAddRestaurant({ name: "", slug: "", ownerEmail: "", ownerName: "Owner" });
      onRestaurantsChange();
      void loadOverview();
    } catch (error) {
      swallowPollingFetchError(error);
      setMessage("Network error — try again.");
    }
  };

  const toggleRestaurant = async (restaurant: TenantRestaurant) => {
    setTogglingRestaurantId(restaurant.id);
    try {
      await fetch("/api/platform/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_restaurant_enabled",
          restaurantId: restaurant.id,
          isEnabled: !(restaurant.isEnabled ?? true),
        }),
      });
      onRestaurantsChange();
      void loadOverview();
    } catch (error) {
      swallowPollingFetchError(error);
    } finally {
      setTogglingRestaurantId(null);
    }
  };

  const stats = overview?.stats;

  return (
    <div className="space-y-6">
      <Card className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-violet-500/20">
        <div>
          <p className="font-medium">{tenantName}</p>
          <p className="text-sm text-zinc-400">
            {tenantEnabled
              ? "Tenant is live — all enabled restaurants operate normally."
              : "Tenant is disabled — all restaurants and staff access are blocked."}
          </p>
        </div>
        <Button
          type="button"
          variant={tenantEnabled ? "secondary" : "success"}
          disabled={togglingTenant}
          onClick={() => void onTenantToggle(!tenantEnabled)}
        >
          {togglingTenant ? "Saving…" : tenantEnabled ? "Disable tenant" : "Enable tenant"}
        </Button>
      </Card>

      <p className="text-sm text-zinc-400">
        Restaurants belonging to <span className="text-zinc-200">{tenantName}</span>. Disable a
        restaurant temporarily to stop orders and staff logins for that location only.
      </p>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            ["Restaurants", stats.restaurantCount],
            ["Active logins", stats.activeLogins ?? 0],
            ["Orders today", stats.ordersToday],
            ["Total orders", stats.totalOrders],
            ["Staff accounts", stats.totalStaff],
          ].map(([label, value]) => (
            <Card key={String(label)} className="p-4">
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="text-2xl font-bold">{value}</p>
            </Card>
          ))}
        </div>
      )}

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-5 h-5 text-violet-400" />
          <h2 className="font-semibold">Restaurants in this tenant</h2>
        </div>

        {mergedRestaurants.length === 0 ? (
          <p className="text-sm text-zinc-500 py-6 text-center">
            No restaurants yet. Add the first one below.
          </p>
        ) : (
          <>
            <div className="mb-4">
              <PlatformRestaurantToolbar
                search={search}
                onSearchChange={setSearch}
                showing={showing}
                total={total}
                onExpandAll={expandAll}
                onCollapseAll={collapseAll}
              />
            </div>

            <div className="space-y-2">
              {filteredRestaurants.length === 0 && search.trim() && (
                <p className="text-sm text-center text-zinc-500 py-6">
                  No restaurants match your search.
                </p>
              )}
              {filteredRestaurants.map((r) => {
                const open = isExpanded(r.id);
                const enabled = r.isEnabled ?? true;
                const sessions = r.activeSessions;
                return (
                  <div
                    key={r.id}
                    className={`rounded-xl border overflow-hidden ${enabled ? "border-white/10" : "border-red-500/30 opacity-80"}`}
                  >
                    <div className="flex items-center gap-2 p-4">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(r.id)}
                        className="flex flex-1 items-center gap-2 min-w-0 text-left hover:opacity-90"
                        aria-expanded={open}
                      >
                        {open ? (
                          <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium truncate">{r.name}</p>
                            {!enabled && (
                              <Badge className="bg-red-500/15 text-red-400 border-red-500/30">
                                Disabled
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500">/{r.slug}</p>
                        </div>
                      </button>
                      <div className="text-right shrink-0 hidden sm:block">
                        {sessions && sessions.total > 0 ? (
                          <p className="text-xs text-emerald-400 flex items-center gap-1 justify-end">
                            <Users className="w-3 h-3" />
                            {sessions.total} logged in
                          </p>
                        ) : (
                          <p className="text-xs text-zinc-500">No active logins</p>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={enabled ? "secondary" : "success"}
                        disabled={togglingRestaurantId === r.id}
                        onClick={() => void toggleRestaurant(r)}
                      >
                        {togglingRestaurantId === r.id ? "…" : enabled ? "Disable" : "Enable"}
                      </Button>
                    </div>
                    {open && (
                      <div className="px-4 pb-4 pt-0 border-t border-white/5 space-y-3">
                        <p className="text-xs text-zinc-500 pt-3">
                          {r._count.tables} tables · {r._count.users} staff · {r._count.orders}{" "}
                          orders
                        </p>
                        <p className="text-xs text-emerald-400">
                          Guest check-in: /order/{r.slug}/{r.slug}-table-1/check-in
                        </p>

                        <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3">
                          <p className="text-xs font-medium text-zinc-300 mb-2 flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-cyan-400" />
                            Active sessions (last 15 min)
                          </p>
                          {sessions && sessions.total > 0 ? (
                            <>
                              <p className="text-xs text-zinc-400 mb-2">
                                {roleSummary(sessions.byRole)}
                              </p>
                              <ul className="space-y-1">
                                {sessions.users.map((u) => (
                                  <li
                                    key={`${u.email}-${u.lastSeenAt}`}
                                    className="text-xs text-zinc-500 flex justify-between gap-2"
                                  >
                                    <span>
                                      {u.name}{" "}
                                      <span className="text-zinc-600">({u.role})</span>
                                    </span>
                                    <span className="shrink-0">
                                      {Math.max(
                                        0,
                                        Math.floor(
                                          (Date.now() - new Date(u.lastSeenAt).getTime()) / 60000,
                                        ),
                                      )}
                                      m ago
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </>
                          ) : (
                            <p className="text-xs text-zinc-500">No staff currently logged in.</p>
                          )}
                        </div>

                        {r.branches.map((b) => (
                          <p key={b.id} className="text-xs text-zinc-400 flex items-center gap-1">
                            <Layers className="w-3 h-3" /> {b.name} —{" "}
                            {b.floors.map((f) => f.name).join(", ")}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add restaurant to {tenantName}
        </h3>
        <div className="grid md:grid-cols-2 gap-2">
          <Input
            placeholder="Restaurant name"
            value={addRestaurant.name}
            onChange={(e) => setAddRestaurant({ ...addRestaurant, name: e.target.value })}
          />
          <Input
            placeholder="Slug (optional)"
            value={addRestaurant.slug}
            onChange={(e) => setAddRestaurant({ ...addRestaurant, slug: e.target.value })}
          />
          <Input
            placeholder="Owner email"
            value={addRestaurant.ownerEmail}
            onChange={(e) => setAddRestaurant({ ...addRestaurant, ownerEmail: e.target.value })}
          />
          <Input
            placeholder="Owner name"
            value={addRestaurant.ownerName}
            onChange={(e) => setAddRestaurant({ ...addRestaurant, ownerName: e.target.value })}
          />
        </div>
        <Button onClick={() => void submitRestaurant()}>Add restaurant</Button>
        {message && (
          <p className={`text-sm ${message.startsWith("Added") ? "text-emerald-400" : "text-red-400"}`}>
            {message}
          </p>
        )}
      </Card>
    </div>
  );
}

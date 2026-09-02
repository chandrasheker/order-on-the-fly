"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Plus, ChevronDown, ChevronUp, Layers, Users } from "lucide-react";
import { Button, Card, Input, Badge } from "@/components/ui";
import { ConfirmDangerDialog } from "@/components/platform/ConfirmDangerDialog";
import { PlatformRestaurantToolbar } from "@/components/platform/PlatformRestaurantToolbar";
import { useRestaurantSearch } from "@/hooks/useRestaurantSearch";
import { isClientOffline, swallowPollingFetchError } from "@/lib/client-fetch";
import { MULTI_RESTAURANT_SAME_NAME_ERROR, previewHostnames } from "@/lib/hostname-rules";

type ActiveSessions = {
  total: number;
  byRole: { OWNER: number; MANAGER: number; COOK: number; SERVER: number };
  users: Array<{ name: string; email: string; role: string; lastSeenAt: string }>;
};

type TenantRestaurant = {
  id: string;
  name: string;
  slug: string;
  url?: string;
  isEnabled?: boolean;
  branches: Array<{ id: string; name: string; slug: string; floors: Array<{ name: string }> }>;
  _count: { users: number; orders: number; tables: number };
  activeSessions?: ActiveSessions;
};

function restaurantHostPreview(slug: string, baseDomain: string) {
  const normalized = slug.trim().toLowerCase();
  if (!normalized || !baseDomain) return "";
  return `https://${normalized}.${baseDomain}`;
}

interface PlatformTenantOverviewProps {
  tenantId: string;
  tenantName: string;
  tenantSlug?: string;
  tenantUrl?: string | null;
  tenantHubActive?: boolean;
  tenantEnabled: boolean;
  tenantBaseDomain?: string;
  restaurants: TenantRestaurant[];
  onRestaurantsChange: () => void;
  onTenantToggle: (enabled: boolean) => Promise<void>;
  togglingTenant: boolean;
  onDeleteTenant: () => void;
  deletingTenant: boolean;
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
  tenantSlug = "",
  tenantUrl = null,
  tenantHubActive = false,
  tenantEnabled,
  tenantBaseDomain = "",
  restaurants,
  onRestaurantsChange,
  onTenantToggle,
  togglingTenant,
  onDeleteTenant,
  deletingTenant,
}: PlatformTenantOverviewProps) {
  const [overview, setOverview] = useState<{
    stats?: Record<string, number>;
    restaurants?: TenantRestaurant[];
  } | null>(null);
  const [addRestaurant, setAddRestaurant] = useState({
    name: "",
    ownerEmail: "",
    ownerName: "Owner",
    tableCount: "6",
  });
  const [message, setMessage] = useState("");
  const [createdRestaurantUrl, setCreatedRestaurantUrl] = useState("");
  const [togglingRestaurantId, setTogglingRestaurantId] = useState<string | null>(null);
  const [deletingRestaurantId, setDeletingRestaurantId] = useState<string | null>(null);
  const [confirmRestaurant, setConfirmRestaurant] = useState<TenantRestaurant | null>(null);
  const [tenantNameDraft, setTenantNameDraft] = useState(tenantName);
  const [renamingTenant, setRenamingTenant] = useState(false);
  const [restaurantNameDrafts, setRestaurantNameDrafts] = useState<Record<string, string>>({});
  const [renamingRestaurantId, setRenamingRestaurantId] = useState<string | null>(null);

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

  const loadOverview = useCallback(async (options?: { signal?: AbortSignal }) => {
    if (isClientOffline()) return;
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/overview`, {
        signal: options?.signal,
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
    const controller = new AbortController();
    void loadOverview({ signal: controller.signal });
    const interval = setInterval(() => {
      void loadOverview({ signal: controller.signal });
    }, 30_000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [loadOverview, tenantEnabled]);

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
      setCreatedRestaurantUrl(String(json.restaurant?.url ?? ""));
      setAddRestaurant({ name: "", ownerEmail: "", ownerName: "Owner", tableCount: "6" });
      onRestaurantsChange();
      void loadOverview();
    } catch (error) {
      swallowPollingFetchError(error);
      setMessage("Network error — try again.");
    }
  };

  const toggleRestaurant = async (restaurant: TenantRestaurant) => {
    setTogglingRestaurantId(restaurant.id);
    setMessage("");
    try {
      const res = await fetch("/api/platform/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_restaurant_enabled",
          restaurantId: restaurant.id,
          isEnabled: !(restaurant.isEnabled ?? true),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(json.error || "Could not update restaurant.");
        return;
      }
      onRestaurantsChange();
      void loadOverview();
    } catch (error) {
      swallowPollingFetchError(error);
      setMessage("Network error — try again.");
    } finally {
      setTogglingRestaurantId(null);
    }
  };

  const deleteRestaurant = async (restaurant: TenantRestaurant) => {
    setDeletingRestaurantId(restaurant.id);
    setMessage("");
    try {
      const res = await fetch("/api/platform/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_restaurant",
          restaurantId: restaurant.id,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(json.error || "Could not delete restaurant.");
        return;
      }
      setConfirmRestaurant(null);
      onRestaurantsChange();
      void loadOverview();
    } catch (error) {
      swallowPollingFetchError(error);
      setMessage("Network error — try again.");
    } finally {
      setDeletingRestaurantId(null);
    }
  };

  const renameTenantName = async () => {
    setRenamingTenant(true);
    setMessage("");
    try {
      const res = await fetch("/api/platform/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename_tenant", tenantId, name: tenantNameDraft }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(json.error || "Could not rename tenant.");
        return;
      }
      onRestaurantsChange();
    } catch (error) {
      swallowPollingFetchError(error);
      setMessage("Network error — try again.");
    } finally {
      setRenamingTenant(false);
    }
  };

  const renameRestaurantName = async (restaurantId: string) => {
    const name = restaurantNameDrafts[restaurantId];
    if (!name?.trim()) return;
    setRenamingRestaurantId(restaurantId);
    setMessage("");
    try {
      const res = await fetch("/api/platform/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename_restaurant", restaurantId, name }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(json.error || "Could not rename restaurant.");
        return;
      }
      onRestaurantsChange();
    } catch (error) {
      swallowPollingFetchError(error);
      setMessage("Network error — try again.");
    } finally {
      setRenamingRestaurantId(null);
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
              ? "Tenant is live — enabled restaurants operate normally. Disabling this tenant immediately disables every restaurant under it."
              : "Tenant is disabled — every restaurant under it is disabled and staff access is blocked. Re-enabling the tenant does not automatically re-enable restaurants."}
          </p>
          {tenantHubActive && tenantUrl && (
            <p className="text-xs text-orange-300 mt-2 break-all">Tenant dashboard: {tenantUrl}</p>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            <Input
              value={tenantNameDraft}
              onChange={(e) => setTenantNameDraft(e.target.value)}
              className="max-w-xs"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={renamingTenant || tenantNameDraft.trim() === tenantName}
              onClick={() => void renameTenantName()}
            >
              {renamingTenant ? "Saving…" : "Save tenant name"}
            </Button>
          </div>
          {tenantNameDraft.trim() && tenantNameDraft.trim() !== tenantName && (
            <div className="text-xs mt-2 space-y-1">
              {(() => {
                try {
                  const preview = previewHostnames({
                    tenantName: tenantNameDraft,
                    restaurantNames: restaurants.map((restaurant) => restaurant.name),
                    baseDomain: tenantBaseDomain,
                  });
                  return (
                    <>
                      {preview.tenantUrl && (
                        <p className="text-orange-300">
                          Tenant dashboard will become {preview.tenantUrl}
                        </p>
                      )}
                      {preview.restaurants.map((restaurant) => (
                        <p key={restaurant.slug} className="text-zinc-400">
                          {restaurant.name} Restaurant URL will become {restaurant.url}
                        </p>
                      ))}
                    </>
                  );
                } catch (err) {
                  return (
                    <p className="text-red-400">
                      {err instanceof Error ? err.message : "Invalid tenant name"}
                    </p>
                  );
                }
              })()}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={tenantEnabled ? "secondary" : "success"}
            disabled={togglingTenant || deletingTenant}
            onClick={() => void onTenantToggle(!tenantEnabled)}
          >
            {togglingTenant ? "Saving…" : tenantEnabled ? "Disable tenant" : "Enable tenant"}
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={deletingTenant}
            onClick={onDeleteTenant}
          >
            Delete tenant
          </Button>
        </div>
      </Card>

      <p className="text-sm text-zinc-400">
        Restaurants belonging to <span className="text-zinc-200">{tenantName}</span>. Disable a
        restaurant to stop orders and staff logins for that location only. Delete permanently
        wipes that restaurant and all of its records. A tenant with one restaurant may share the
        tenant name; adding another restaurant requires a different tenant name first.
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
                          <p className="text-xs text-zinc-500">
                            Restaurant URL:{" "}
                            {r.url || restaurantHostPreview(r.slug, tenantBaseDomain) || `/${r.slug}`}
                          </p>
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
                        disabled={togglingRestaurantId === r.id || deletingRestaurantId === r.id}
                        onClick={() => void toggleRestaurant(r)}
                      >
                        {togglingRestaurantId === r.id ? "…" : enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        disabled={deletingRestaurantId === r.id}
                        onClick={() => setConfirmRestaurant(r)}
                      >
                        Delete
                      </Button>
                    </div>
                    {open && (
                      <div className="px-4 pb-4 pt-0 border-t border-white/5 space-y-3">
                        <div className="flex flex-wrap gap-2 pt-3">
                          <Input
                            value={restaurantNameDrafts[r.id] ?? r.name}
                            onChange={(e) =>
                              setRestaurantNameDrafts((current) => ({
                                ...current,
                                [r.id]: e.target.value,
                              }))
                            }
                            className="max-w-xs"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={
                              renamingRestaurantId === r.id ||
                              (restaurantNameDrafts[r.id] ?? r.name).trim() === r.name
                            }
                            onClick={() => void renameRestaurantName(r.id)}
                          >
                            {renamingRestaurantId === r.id ? "Saving…" : "Save name"}
                          </Button>
                        </div>
                        {(restaurantNameDrafts[r.id] ?? r.name).trim() &&
                          (restaurantNameDrafts[r.id] ?? r.name).trim() !== r.name && (
                            <p className="text-xs text-orange-300">
                              {(() => {
                                try {
                                  const preview = previewHostnames({
                                    tenantName,
                                    restaurantNames: restaurants.map((row) =>
                                      row.id === r.id ? restaurantNameDrafts[r.id] ?? r.name : row.name,
                                    ),
                                    tenantSlug,
                                    baseDomain: tenantBaseDomain,
                                  });
                                  const next = preview.restaurants.find(
                                    (row) => row.name === (restaurantNameDrafts[r.id] ?? r.name).trim(),
                                  );
                                  return `Restaurant URL will become ${next?.url || next?.slug}`;
                                } catch (err) {
                                  return err instanceof Error ? err.message : "Invalid restaurant name";
                                }
                              })()}
                            </p>
                          )}
                        <p className="text-xs text-zinc-500">
                          {r._count.tables} tables · {r._count.users} staff · {r._count.orders}{" "}
                          orders
                        </p>
                        <p className="text-xs text-emerald-400 break-all">
                          Restaurant host:{" "}
                          {r.url || restaurantHostPreview(r.slug, tenantBaseDomain) || `/${r.slug}`}
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
            placeholder="Owner email"
            value={addRestaurant.ownerEmail}
            onChange={(e) => setAddRestaurant({ ...addRestaurant, ownerEmail: e.target.value })}
          />
          <Input
            placeholder="Owner name"
            value={addRestaurant.ownerName}
            onChange={(e) => setAddRestaurant({ ...addRestaurant, ownerName: e.target.value })}
          />
          <Input
            placeholder="Number of tables"
            value={addRestaurant.tableCount}
            onChange={(e) => setAddRestaurant({ ...addRestaurant, tableCount: e.target.value })}
          />
        </div>
        {addRestaurant.name.trim() && (
          <p className="text-xs text-zinc-400">
            {(() => {
              try {
                const preview = previewHostnames({
                  tenantName,
                  restaurantNames: [...restaurants.map((r) => r.name), addRestaurant.name],
                  tenantSlug,
                  baseDomain: tenantBaseDomain,
                });
                const created = preview.restaurants[preview.restaurants.length - 1];
                return `Restaurant URL: ${created?.url || created?.slug}`;
              } catch (err) {
                return err instanceof Error ? err.message : MULTI_RESTAURANT_SAME_NAME_ERROR;
              }
            })()}
          </p>
        )}
        <Button
          onClick={() => void submitRestaurant()}
          disabled={
            !addRestaurant.name.trim() ||
            (() => {
              try {
                previewHostnames({
                  tenantName,
                  restaurantNames: [...restaurants.map((r) => r.name), addRestaurant.name],
                  tenantSlug,
                });
                return false;
              } catch {
                return true;
              }
            })()
          }
        >
          Add restaurant
        </Button>
        {message && (
          <p className={`text-sm ${message.startsWith("Added") ? "text-emerald-400" : "text-red-400"}`}>
            {message}
          </p>
        )}
        {createdRestaurantUrl && (
          <div className="flex flex-wrap gap-3 text-sm">
            <a href={createdRestaurantUrl} className="text-orange-300 underline">
              Open restaurant
            </a>
            <a href={createdRestaurantUrl} className="text-orange-300 underline">
              Staff sign in
            </a>
          </div>
        )}
      </Card>

      {confirmRestaurant && (
        <ConfirmDangerDialog
          title="Delete this restaurant?"
          subject={`Permanently delete ${confirmRestaurant.name}.`}
          details="Staff, menus, orders, payments, tables, and every other record for this restaurant will be wiped from the database. This cannot be recovered."
          confirmLabel="Delete restaurant permanently"
          busy={deletingRestaurantId === confirmRestaurant.id}
          onCancel={() => setConfirmRestaurant(null)}
          onConfirm={() => void deleteRestaurant(confirmRestaurant)}
        />
      )}
    </div>
  );
}

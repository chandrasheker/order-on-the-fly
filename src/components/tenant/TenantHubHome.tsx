"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge, Button, Card, Spinner } from "@/components/ui";
import {
  Activity,
  Building2,
  ChevronDown,
  ChevronUp,
  Crown,
  ExternalLink,
  LayoutGrid,
  ScrollText,
  Shield,
  Store,
  Users,
} from "lucide-react";
import { FilterPills, TimeRangeBar } from "@/components/platform/command-center-shared";
import {
  TenantAnalyticsPanel,
  TenantOperationsPanel,
  TenantOverviewStats,
} from "@/components/platform/PlatformCommandPanels";
import { PlatformScopedLogsConsole } from "@/components/platform/PlatformScopedLogsConsole";
import { swallowPollingFetchError } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";
import type { CommandCenterPayload } from "@/platform/command-center/types";

type TenantTab =
  | "overview"
  | "restaurants"
  | "operations"
  | "analytics"
  | "staff"
  | "logs"
  | "features";

type ActiveSessions = {
  total: number;
  byRole: { OWNER: number; MANAGER: number; COOK: number; SERVER: number };
  users: Array<{ name: string; email: string; role: string; lastSeenAt: string }>;
};

type Overview = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    subscriptionStatus: string;
    isEnabled: boolean;
    hubActive: boolean;
    billingEmail: string | null;
    createdAt: string;
    updatedAt: string;
    demoExpiresAt: string | null;
    demoPackUsedAt: string | null;
    url: string | null;
    tenantAdminUrl: string | null;
  };
  tenantBaseDomain: string;
  admins: Array<{ id: string; name: string; email: string; createdAt: string }>;
  subscriptions: Array<{
    id: string;
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  hostSlugs: Array<{ slug: string; kind: string; url: string }>;
  restaurants: Array<{
    id: string;
    name: string;
    slug: string;
    url: string;
    isEnabled: boolean;
    createdAt: string;
    serviceMode: string;
    pickupLocationLabel: string;
    hybridDefaultFulfillment: string;
    staffConfigured: boolean;
    slotCounts: { owner: number; manager: number; cook: number; server: number };
    kitchenPaused: boolean;
    kitchenPauseMessage: string | null;
    kitchenAutoPauseOverdueThreshold: number;
    receiptAddress: string | null;
    receiptPhone: string | null;
    receiptGstin: string | null;
    receiptGstEnabled: boolean;
    receiptGstRate: number;
    receiptFooter: string | null;
    upiVpa: string | null;
    upiMerchantName: string | null;
    paymentGatewayProvider: string | null;
    pushAlertsEnabled: boolean;
    smsAlertsEnabled: boolean;
    logoUrl: string | null;
    _count: { users: number; orders: number; tables: number };
    activeSessions: ActiveSessions;
    branches: Array<{
      id: string;
      name: string;
      slug: string;
      address: string | null;
      isDefault: boolean;
      timezone: string;
      floors: Array<{ id: string; name: string; slug: string; isDefault: boolean; sortOrder: number }>;
    }>;
    staff: Array<{
      id: string;
      name: string;
      email: string;
      role: string;
      slotKey: string | null;
      createdAt: string;
    }>;
  }>;
  stats: {
    restaurantCount: number;
    enabledRestaurants: number;
    configuredStaffRestaurants: number;
    ordersToday: number;
    totalOrders: number;
    totalStaff: number;
    totalTables: number;
    activeLogins: number;
  };
};

type StaffRestaurant = {
  id: string;
  name: string;
  slug: string;
  staffConfigured: boolean;
  counts: { owner: number; manager: number; cook: number; server: number };
  slots: Array<{ slotKey: string; role: string; userId: string | null; name: string; email: string }>;
};

type FeatureRestaurant = {
  id: string;
  name: string;
  slug: string;
  features: Array<{
    key: string;
    name: string;
    problem: string;
    tier: "core" | "premium" | "roadmap";
    enabled: boolean;
    roadmap?: boolean;
  }>;
};

const TABS: { id: TenantTab; label: string; icon: typeof LayoutGrid }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "restaurants", label: "Restaurants", icon: Store },
  { id: "operations", label: "Operations", icon: Activity },
  { id: "analytics", label: "Analytics", icon: Shield },
  { id: "staff", label: "Staff", icon: Users },
  { id: "logs", label: "Logs", icon: ScrollText },
  { id: "features", label: "Features", icon: Crown },
];

function formatWhen(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function prettyMode(value: string) {
  return value.replaceAll("_", " ");
}

function roleSummary(byRole: ActiveSessions["byRole"]) {
  const parts: string[] = [];
  if (byRole.OWNER) parts.push(`${byRole.OWNER} owner${byRole.OWNER > 1 ? "s" : ""}`);
  if (byRole.MANAGER) parts.push(`${byRole.MANAGER} manager${byRole.MANAGER > 1 ? "s" : ""}`);
  if (byRole.COOK) parts.push(`${byRole.COOK} cook${byRole.COOK > 1 ? "s" : ""}`);
  if (byRole.SERVER) parts.push(`${byRole.SERVER} server${byRole.SERVER > 1 ? "s" : ""}`);
  return parts.length ? parts.join(", ") : "Nobody logged in";
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-sm text-zinc-200 break-words mt-0.5">{value || "—"}</p>
    </div>
  );
}

export function TenantHubHome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as TenantTab) || "overview";
  const [tab, setTab] = useState<TenantTab>(TABS.some((item) => item.id === initialTab) ? initialTab : "overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [admin, setAdmin] = useState<{ name: string; email: string } | null>(null);
  const [command, setCommand] = useState<CommandCenterPayload | null>(null);
  const [staff, setStaff] = useState<StaffRestaurant[]>([]);
  const [features, setFeatures] = useState<FeatureRestaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("name");
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const range = searchParams.get("range") || "today";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const restaurantFilter = searchParams.get("restaurantId") || "";
  const preset = searchParams.get("preset") || "all";

  const replaceParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      router.replace(`/tenant?${params.toString()}`);
    },
    [router, searchParams],
  );

  const load = useCallback(async () => {
    try {
      const me = await fetch("/api/tenant-admin/auth/me");
      if (!me.ok) {
        router.push("/tenant/login");
        return;
      }
      const meJson = await me.json();
      setAdmin(meJson.admin);

      const commandParams = new URLSearchParams({ range });
      if (range === "custom" && from && to) {
        commandParams.set("from", from);
        commandParams.set("to", to);
      }

      const [overviewRes, commandRes, staffRes, featuresRes] = await Promise.all([
        fetch("/api/tenant-admin/overview", { cache: "no-store" }),
        fetch(`/api/tenant-admin/command?${commandParams.toString()}`, { cache: "no-store" }),
        fetch("/api/tenant-admin/staff", { cache: "no-store" }),
        fetch("/api/tenant-admin/features", { cache: "no-store" }),
      ]);
      if (!overviewRes.ok) {
        router.push("/tenant/login");
        return;
      }
      setOverview(await overviewRes.json());
      if (commandRes.ok) setCommand((await commandRes.json()) as CommandCenterPayload);
      if (staffRes.ok) {
        const json = await staffRes.json();
        setStaff(json.restaurants ?? []);
      }
      if (featuresRes.ok) {
        const json = await featuresRes.json();
        setFeatures(json.restaurants ?? []);
      }
    } catch (error) {
      swallowPollingFetchError(error);
    } finally {
      setLoading(false);
    }
  }, [from, range, router, to]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const next = (searchParams.get("tab") as TenantTab) || "overview";
    if (TABS.some((item) => item.id === next)) setTab(next);
  }, [searchParams]);

  const logout = async () => {
    await fetch("/api/tenant-admin/auth/logout", { method: "POST" });
    router.push("/tenant/login");
  };

  const filteredCommand = useMemo(() => {
    if (!command || !restaurantFilter) return command;
    const restaurants = command.restaurants.filter((row) => row.restaurantId === restaurantFilter);
    return restaurants.length ? { ...command, restaurants } : command;
  }, [command, restaurantFilter]);

  if (loading || !overview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-shell">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  const { tenant, restaurants, stats, admins, subscriptions, hostSlugs } = overview;
  const showRange = tab === "overview" || tab === "restaurants" || tab === "operations" || tab === "analytics";

  return (
    <div className="min-h-screen bg-app-shell text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-zinc-500">Tenant administrator</p>
          <h1 className="text-2xl font-bold">{tenant.name}</h1>
          <p className="text-sm text-zinc-400">
            {tenant.plan} · {tenant.subscriptionStatus} · {stats.restaurantCount} restaurant
            {stats.restaurantCount === 1 ? "" : "s"}
            {!tenant.isEnabled ? " · DISABLED" : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {admin && <p className="text-sm text-zinc-400 hidden sm:block">{admin.email}</p>}
          <Button variant="secondary" size="sm" onClick={() => void logout()}>
            Logout
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex flex-wrap gap-2 border-b border-white/5 pb-4">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                replaceParams({ tab: id });
              }}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors",
                tab === id
                  ? id === "features"
                    ? "bg-amber-500/20 border-amber-500/40 text-amber-200"
                    : id === "logs"
                      ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-200"
                      : "bg-violet-500/20 border-violet-500/40 text-violet-200"
                  : "bg-white/5 border-white/10 text-zinc-400 hover:text-white",
              )}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {showRange && (
          <TimeRangeBar
            range={range}
            from={from}
            to={to}
            onRange={(value) =>
              replaceParams({
                range: value,
                from: value === "custom" ? from : null,
                to: value === "custom" ? to : null,
              })
            }
            onCustom={(nextFrom, nextTo) => replaceParams({ range: "custom", from: nextFrom, to: nextTo })}
          />
        )}

        {tab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              {[
                ["Restaurants", stats.restaurantCount],
                ["Enabled", stats.enabledRestaurants],
                ["Active logins", stats.activeLogins],
                ["Orders today", stats.ordersToday],
                ["Total orders", stats.totalOrders],
                ["Staff accounts", stats.totalStaff],
                ["Tables", stats.totalTables],
                ["Staff setup", `${stats.configuredStaffRestaurants}/${stats.restaurantCount}`],
              ].map(([label, value]) => (
                <Card key={String(label)} className="p-4">
                  <p className="text-xs text-zinc-500">{label}</p>
                  <p className="text-2xl font-bold">{value}</p>
                </Card>
              ))}
            </div>

            {filteredCommand && (
              <TenantOverviewStats command={filteredCommand} sort={sort} onSort={setSort} filter={filter} />
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-5 space-y-3">
                <h2 className="font-semibold">Tenant identity</h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Detail label="Name" value={tenant.name} />
                  <Detail label="Slug" value={tenant.slug} />
                  <Detail label="Plan" value={tenant.plan} />
                  <Detail label="Subscription" value={tenant.subscriptionStatus} />
                  <Detail label="Status" value={tenant.isEnabled ? "Enabled" : "Disabled"} />
                  <Detail label="Billing email" value={tenant.billingEmail} />
                  <Detail label="Created" value={formatWhen(tenant.createdAt)} />
                  <Detail label="Updated" value={formatWhen(tenant.updatedAt)} />
                  <Detail label="Demo expires" value={formatWhen(tenant.demoExpiresAt)} />
                  <Detail label="Demo pack used" value={formatWhen(tenant.demoPackUsedAt)} />
                  <Detail
                    label={tenant.hubActive ? "Tenant command center" : "Tenant admin host"}
                    value={tenant.tenantAdminUrl ?? tenant.url ?? restaurants[0]?.url ?? "—"}
                  />
                  <Detail label="Base domain" value={overview.tenantBaseDomain || "—"} />
                </div>
              </Card>

              <Card className="p-5 space-y-3">
                <h2 className="font-semibold">Hostnames</h2>
                <div className="space-y-2">
                  {hostSlugs.map((row) => (
                    <div key={`${row.kind}-${row.slug}`} className="rounded-xl border border-white/10 p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="bg-white/5 text-zinc-300 border-white/10">{row.kind}</Badge>
                        <p className="text-sm font-medium">{row.slug}</p>
                      </div>
                      <p className="text-xs text-zinc-500 break-all mt-1">{row.url}</p>
                    </div>
                  ))}
                  {hostSlugs.length === 0 && <p className="text-sm text-zinc-500">No hostname leases yet.</p>}
                </div>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-5 space-y-3">
                <h2 className="font-semibold">Subscription history</h2>
                {subscriptions.length === 0 ? (
                  <p className="text-sm text-zinc-500">No subscription rows recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {subscriptions.map((row) => (
                      <div key={row.id} className="rounded-xl border border-white/10 p-3 text-sm">
                        <p className="font-medium">
                          {row.plan} · {row.status}
                        </p>
                        <p className="text-xs text-zinc-500">
                          Period end {formatWhen(row.currentPeriodEnd)} · created {formatWhen(row.createdAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="p-5 space-y-3">
                <h2 className="font-semibold">Tenant administrators</h2>
                <div className="space-y-2">
                  {admins.map((row) => (
                    <div key={row.id} className="rounded-xl border border-white/10 p-3">
                      <p className="font-medium">{row.name}</p>
                      <p className="text-sm text-zinc-400">{row.email}</p>
                      <p className="text-xs text-zinc-500">Added {formatWhen(row.createdAt)}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}

        {tab === "restaurants" && (
          <div className="space-y-4">
            {filteredCommand && (
              <>
                <FilterPills
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { id: "all", label: "All" },
                    { id: "attention", label: "Needs attention" },
                    { id: "kitchen", label: "Kitchen" },
                    { id: "service", label: "Service" },
                    { id: "payments", label: "Payments" },
                    { id: "printing", label: "Printing" },
                    { id: "errors", label: "Errors" },
                  ]}
                />
                <TenantOverviewStats command={filteredCommand} sort={sort} onSort={setSort} filter={filter} />
              </>
            )}
            <Card className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-violet-400" />
                <h2 className="font-semibold">Restaurant directory</h2>
              </div>
              <div className="space-y-2">
                {restaurants.map((restaurant) => {
                  const open = expanded[restaurant.id] ?? restaurantFilter === restaurant.id;
                  return (
                    <div key={restaurant.id} className="rounded-xl border border-white/10">
                      <div className="p-4 flex items-center justify-between gap-3">
                        <button
                          type="button"
                          className="min-w-0 text-left flex-1"
                          onClick={() =>
                            setExpanded((prev) => ({ ...prev, [restaurant.id]: !open }))
                          }
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            {open ? (
                              <ChevronUp className="w-4 h-4 text-zinc-500" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-zinc-500" />
                            )}
                            <p className="font-medium">{restaurant.name}</p>
                            {!restaurant.isEnabled && (
                              <Badge className="bg-red-500/15 text-red-400 border-red-500/30">Disabled</Badge>
                            )}
                            <Badge className="bg-white/5 text-zinc-300 border-white/10">
                              {prettyMode(restaurant.serviceMode)}
                            </Badge>
                          </div>
                          <p className="text-xs text-zinc-500 break-all mt-1">{restaurant.url}</p>
                          <p className="text-xs text-zinc-500 mt-1">
                            {restaurant._count.tables} tables · {restaurant._count.users} staff ·{" "}
                            {restaurant.activeSessions.total} logged in · {roleSummary(restaurant.activeSessions.byRole)}
                          </p>
                        </button>
                        <a href={restaurant.url} className="shrink-0">
                          <Button size="sm" variant="secondary">
                            <ExternalLink className="w-4 h-4" /> Open
                          </Button>
                        </a>
                      </div>
                      {open && (
                        <div className="px-4 pb-4 space-y-4 border-t border-white/5 pt-4">
                          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            <Detail label="Service mode" value={prettyMode(restaurant.serviceMode)} />
                            <Detail label="Pickup label" value={restaurant.pickupLocationLabel} />
                            <Detail label="Hybrid default" value={prettyMode(restaurant.hybridDefaultFulfillment)} />
                            <Detail
                              label="Kitchen"
                              value={
                                restaurant.kitchenPaused
                                  ? `Paused${restaurant.kitchenPauseMessage ? ` — ${restaurant.kitchenPauseMessage}` : ""}`
                                  : "Running"
                              }
                            />
                            <Detail
                              label="Auto-pause overdue"
                              value={restaurant.kitchenAutoPauseOverdueThreshold || "Off"}
                            />
                            <Detail
                              label="Automatic payments"
                              value={restaurant.paymentGatewayProvider ?? "Not configured"}
                            />
                            <Detail label="UPI VPA" value={restaurant.upiVpa} />
                            <Detail label="UPI merchant" value={restaurant.upiMerchantName} />
                            <Detail
                              label="Alerts"
                              value={`Push ${restaurant.pushAlertsEnabled ? "on" : "off"} · SMS ${restaurant.smsAlertsEnabled ? "on" : "off"}`}
                            />
                            <Detail label="Receipt address" value={restaurant.receiptAddress} />
                            <Detail label="Receipt phone" value={restaurant.receiptPhone} />
                            <Detail
                              label="GST"
                              value={
                                restaurant.receiptGstEnabled
                                  ? `${restaurant.receiptGstRate}%${restaurant.receiptGstin ? ` · ${restaurant.receiptGstin}` : ""}`
                                  : "Off"
                              }
                            />
                            <Detail label="Receipt footer" value={restaurant.receiptFooter} />
                            <Detail
                              label="Staff slots"
                              value={`Owner ${restaurant.slotCounts.owner} · Manager ${restaurant.slotCounts.manager} · Cook ${restaurant.slotCounts.cook} · Server ${restaurant.slotCounts.server}${restaurant.staffConfigured ? "" : " · not configured"}`}
                            />
                            <Detail label="Created" value={formatWhen(restaurant.createdAt)} />
                          </div>
                          <div>
                            <p className="text-xs text-zinc-500 mb-2">Branches & floors</p>
                            <div className="space-y-2">
                              {restaurant.branches.map((branch) => (
                                <div key={branch.id} className="rounded-lg bg-white/5 p-3 text-sm">
                                  <p className="font-medium">
                                    {branch.name}
                                    {branch.isDefault ? " · default" : ""}
                                  </p>
                                  <p className="text-xs text-zinc-500">
                                    {branch.address || "No address"} · {branch.timezone}
                                  </p>
                                  <p className="text-xs text-zinc-400 mt-1">
                                    {branch.floors.map((floor) => floor.name).join(" · ") || "No floors"}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-zinc-500 mb-2">Staff roster</p>
                            <div className="space-y-1">
                              {restaurant.staff.map((member) => (
                                <p key={member.id} className="text-sm text-zinc-300">
                                  {member.name} · {member.role}
                                  {member.slotKey ? ` · ${member.slotKey}` : ""} · {member.email}
                                </p>
                              ))}
                              {restaurant.staff.length === 0 && (
                                <p className="text-sm text-zinc-500">No staff accounts yet.</p>
                              )}
                            </div>
                          </div>
                          {restaurant.activeSessions.users.length > 0 && (
                            <div>
                              <p className="text-xs text-zinc-500 mb-2">Active sessions</p>
                              {restaurant.activeSessions.users.map((user) => (
                                <p key={`${user.email}-${user.lastSeenAt}`} className="text-sm text-zinc-300">
                                  {user.name} · {user.role} · last seen {formatWhen(user.lastSeenAt)}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        {tab === "operations" && (filteredCommand ? <TenantOperationsPanel command={filteredCommand} /> : <Spinner />)}
        {tab === "analytics" && (filteredCommand ? <TenantAnalyticsPanel command={filteredCommand} /> : <Spinner />)}

        {tab === "staff" && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              Read-only staff roster for this tenant. Slot counts and passwords are managed by the platform owner.
            </p>
            {staff.map((restaurant) => (
              <Card key={restaurant.id} className="p-5 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="font-semibold">{restaurant.name}</h2>
                    <p className="text-xs text-zinc-500">
                      {restaurant.slug} ·{" "}
                      {restaurant.staffConfigured ? "Slots configured" : "Slots not configured yet"}
                    </p>
                  </div>
                  <p className="text-xs text-zinc-500">
                    Owner {restaurant.counts.owner} · Manager {restaurant.counts.manager} · Cook{" "}
                    {restaurant.counts.cook} · Server {restaurant.counts.server}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-zinc-500">
                      <tr>
                        <th className="text-left py-1">Slot</th>
                        <th className="text-left py-1">Role</th>
                        <th className="text-left py-1">Name</th>
                        <th className="text-left py-1">Email</th>
                        <th className="text-left py-1">Account</th>
                      </tr>
                    </thead>
                    <tbody>
                      {restaurant.slots.map((slot) => (
                        <tr key={slot.slotKey} className="border-t border-white/5">
                          <td className="py-2">{slot.slotKey}</td>
                          <td className="py-2">{slot.role}</td>
                          <td className="py-2">{slot.name}</td>
                          <td className="py-2">{slot.email}</td>
                          <td className="py-2">{slot.userId ? "Created" : "Empty slot"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </div>
        )}

        {tab === "logs" && (
          <PlatformScopedLogsConsole
            endpoint="/api/tenant-admin/logs"
            restaurants={restaurants.map((row) => ({ id: row.id, name: row.name }))}
            restaurantId={restaurantFilter}
            onRestaurantId={(id) => replaceParams({ restaurantId: id || null })}
            initialPreset={preset}
            initialFingerprint={searchParams.get("errorFingerprint") ?? undefined}
            failedOnly={searchParams.get("failedOnly") === "1"}
            ambiguousOnly={searchParams.get("ambiguousOnly") === "1"}
            title="Tenant logs"
            subtitle="Forensic evidence for this tenant only. Filters change the view, not the dataset."
          />
        )}

        {tab === "features" && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              Read-only feature flags. Premium toggles stay with the platform owner.
            </p>
            {features.map((restaurant) => {
              const enabled = restaurant.features.filter((feature) => feature.enabled).length;
              return (
                <Card key={restaurant.id} className="p-5 space-y-3">
                  <div>
                    <h2 className="font-semibold">{restaurant.name}</h2>
                    <p className="text-xs text-zinc-500">
                      {enabled}/{restaurant.features.length} features enabled
                    </p>
                  </div>
                  {(["core", "premium", "roadmap"] as const).map((tier) => {
                    const rows = restaurant.features.filter((feature) => feature.tier === tier);
                    if (!rows.length) return null;
                    return (
                      <div key={tier} className="space-y-2">
                        <p className="text-xs uppercase tracking-wide text-zinc-500">{tier}</p>
                        <div className="grid sm:grid-cols-2 gap-2">
                          {rows.map((feature) => (
                            <div key={feature.key} className="rounded-xl border border-white/10 p-3">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium">{feature.name}</p>
                                <Badge
                                  className={
                                    feature.enabled
                                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                      : "bg-white/5 text-zinc-400 border-white/10"
                                  }
                                >
                                  {feature.enabled ? "On" : "Off"}
                                </Badge>
                              </div>
                              <p className="text-xs text-zinc-500 mt-1">{feature.problem}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

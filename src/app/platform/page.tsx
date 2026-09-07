"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Badge, Card, Spinner } from "@/components/ui";
import { ChevronRight, Plus } from "lucide-react";
import { PlatformShell } from "@/components/platform/PlatformShell";
import {
  FilterPills,
  HealthBadge,
  Money,
  RestaurantHealthTable,
  TimeRangeBar,
} from "@/components/platform/command-center-shared";
import {
  PlatformPagedListFrame,
  PlatformRestaurantToolbar,
} from "@/components/platform/PlatformRestaurantToolbar";
import { usePagedExpandableList } from "@/hooks/usePagedExpandableList";
import { swallowPollingFetchError } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";
import type { CommandCenterPayload } from "@/platform/command-center/types";

type TenantSummary = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  subscriptionStatus: string;
  billingEmail: string | null;
  isEnabled?: boolean;
  restaurants: Array<{ id: string; name: string; slug: string }>;
};

type DirectoryView = "tenants" | "fleet";

function tenantStatus(tenant: TenantSummary, command: CommandCenterPayload | null) {
  if (tenant.isEnabled === false) return { label: "Disabled", warn: true };
  const attention = (command?.restaurants ?? []).some(
    (row) => row.tenantId === tenant.id && row.needsAttention,
  );
  if (attention) return { label: "Attention", warn: true };
  return { label: "Healthy", warn: false };
}

function PlatformHomePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get("view");
  const directory: DirectoryView = viewParam === "fleet" || viewParam === "restaurants" ? "fleet" : "tenants";
  const [admin, setAdmin] = useState<{ name: string; email: string } | null>(null);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [command, setCommand] = useState<CommandCenterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("name");
  const [filter, setFilter] = useState("all");
  const [range, setRange] = useState("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const getTenantId = useCallback((tenant: TenantSummary) => tenant.id, []);
  const getTenantText = useCallback(
    (tenant: TenantSummary) => `${tenant.name} ${tenant.slug} ${tenant.billingEmail ?? ""}`,
    [],
  );
  const tenantList = usePagedExpandableList(tenants, {
    getId: getTenantId,
    getSearchText: getTenantText,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextFilter = params.get("filter");
    if (
      nextFilter &&
      ["all", "attention", "kitchen", "service", "payments", "printing", "errors"].includes(nextFilter)
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate fleet filter from URL without useSearchParams
      setFilter(nextFilter);
    }
  }, []);

  const setRangeParams = (next: { range: string; from?: string; to?: string }) => {
    setRange(next.range);
    setFrom(next.from ?? "");
    setTo(next.to ?? "");
  };

  const selectDirectory = (view: DirectoryView) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view);
    router.replace(`/platform?${params.toString()}`);
  };

  const load = useCallback(async () => {
    try {
      const meRes = await fetch("/api/platform/auth/me", { credentials: "same-origin" });
      if (!meRes.ok) {
        router.push("/platform/login");
        return;
      }
      const me = await meRes.json();
      setAdmin(me.admin);

      const params = new URLSearchParams({ range });
      if (range === "custom" && from && to) {
        params.set("from", from);
        params.set("to", to);
      }
      const [tenantsRes, commandRes] = await Promise.all([
        fetch("/api/platform/tenants"),
        fetch(`/api/platform/command-center?${params.toString()}`),
      ]);
      if (tenantsRes.ok) {
        const json = await tenantsRes.json();
        const list = (json.tenants ?? []) as TenantSummary[];
        list.sort((a, b) => a.name.localeCompare(b.name));
        setTenants(list);
      }
      if (commandRes.ok) {
        setCommand((await commandRes.json()) as CommandCenterPayload);
      }
    } catch (error) {
      swallowPollingFetchError(error);
    } finally {
      setLoading(false);
    }
  }, [from, range, router, to]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- platform fetch-on-mount
    void load();
  }, [load]);

  const attentionRows = useMemo(
    () => (command?.restaurants ?? []).filter((row) => row.needsAttention),
    [command],
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-shell">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  const summary = command?.summary;
  const needAttention = summary?.needAttention ?? 0;

  return (
    <PlatformShell
      wide
      admin={admin}
      title="Platform Command Center"
      subtitle="Operational view across all tenants and restaurants"
      activeItem={directory === "fleet" ? "restaurants" : viewParam === "tenants" ? "tenants" : "overview"}
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <TimeRangeBar
            range={range}
            from={from}
            to={to}
            onRange={(value) => setRangeParams({ range: value, from, to })}
            onCustom={(nextFrom, nextTo) => setRangeParams({ range: "custom", from: nextFrom, to: nextTo })}
          />
          <Link
            href="/platform/tenants/new"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/25"
          >
            <Plus className="w-4 h-4" /> New Tenant
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
          <Kpi label="Tenants" value={String(summary?.tenantCount ?? tenants.length)} />
          <Kpi
            label="Restaurants"
            value={String(summary?.restaurantCount ?? 0)}
            hint={`${summary?.activeNow ?? 0} active now`}
          />
          <Kpi
            label="Orders"
            value={String(summary?.orders ?? 0)}
            hint={summary?.slaLabel ? `SLA ${summary.slaLabel}` : command?.range.label}
          />
          <Kpi
            label="Net Captured"
            value={summary ? undefined : "₹0"}
            money={summary?.netCapturedPaise}
            hint={command?.range.label}
          />
          <button
            type="button"
            className="text-left"
            onClick={() => {
              setFilter("attention");
              selectDirectory("fleet");
            }}
          >
            <Kpi
              label="Needs Attention"
              value={String(needAttention)}
              hint={needAttention > 0 ? "Open restaurant fleet" : "All clear"}
              warn={needAttention > 0}
            />
          </button>
        </div>

        {needAttention === 0 ? (
          <p className="text-sm text-zinc-500 px-1">All monitored restaurants are operating normally.</p>
        ) : (
          <Card className="p-4 border-amber-500/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-amber-200">
                  {needAttention} restaurant{needAttention === 1 ? "" : "s"} need attention
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  {attentionRows.slice(0, 4).map((row) => row.restaurantName).join(" · ")}
                  {attentionRows.length > 4 ? ` · +${attentionRows.length - 4} more` : ""}
                </p>
              </div>
              <button
                type="button"
                className="text-sm text-amber-200 hover:text-white"
                onClick={() => {
                  setFilter("attention");
                  selectDirectory("fleet");
                }}
              >
                View fleet
              </button>
            </div>
          </Card>
        )}

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["tenants", "Tenants"],
              ["fleet", "Restaurant Fleet"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => selectDirectory(id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium border",
                directory === id
                  ? "bg-violet-500/15 border-violet-500/30 text-violet-100"
                  : "bg-white/5 border-white/10 text-zinc-400 hover:text-white",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {directory === "tenants" ? (
          <div className="space-y-3">
            <PlatformRestaurantToolbar
              search={tenantList.search}
              onSearchChange={tenantList.setSearch}
              matching={tenantList.matchingCount}
              total={tenantList.total}
              showingFrom={tenantList.showingFrom}
              showingTo={tenantList.showingTo}
              pageSize={tenantList.pageSize}
              onPageSizeChange={tenantList.setPageSize}
              page={tenantList.page}
              pageCount={tenantList.pageCount}
              canPrev={tenantList.canPrev}
              canNext={tenantList.canNext}
              onPrev={tenantList.goPrev}
              onNext={tenantList.goNext}
              expandable={false}
              noun="tenant"
              placeholder="Search tenants by name or slug…"
            />
            {tenantList.matchingCount === 0 && (
              <Card className="p-6 text-center">
                <p className="text-zinc-500">
                  {tenantList.search.trim() ? "No tenants match your search." : "No tenants yet."}
                </p>
              </Card>
            )}
            <PlatformPagedListFrame
              canPrev={tenantList.canPrev}
              canNext={tenantList.canNext}
              onPrev={tenantList.goPrev}
              onNext={tenantList.goNext}
              noun="tenant"
            >
              <div className="hidden md:block overflow-hidden rounded-xl border border-white/10">
                <table className="min-w-full text-sm">
                  <thead className="bg-white/5 text-zinc-500">
                    <tr>
                      <th className="text-left font-medium px-4 py-2">Tenant</th>
                      <th className="text-left font-medium px-4 py-2">Plan</th>
                      <th className="text-left font-medium px-4 py-2">Subscription</th>
                      <th className="text-left font-medium px-4 py-2">Restaurants</th>
                      <th className="text-left font-medium px-4 py-2">Status</th>
                      <th className="px-4 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {tenantList.visible.map((tenant) => {
                      const status = tenantStatus(tenant, command);
                      return (
                        <tr key={tenant.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                          <td className="px-4 py-3">
                            <Link href={`/platform/tenants/${tenant.id}`} className="block min-w-0">
                              <p className="font-medium text-zinc-100">{tenant.name}</p>
                              <p className="text-xs text-zinc-500 truncate">
                                {tenant.slug}
                                {tenant.billingEmail ? ` · ${tenant.billingEmail}` : ""}
                              </p>
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-zinc-300">{tenant.plan}</td>
                          <td className="px-4 py-3 text-zinc-400">{tenant.subscriptionStatus}</td>
                          <td className="px-4 py-3 text-zinc-300">
                            {tenant.restaurants.length} restaurant{tenant.restaurants.length === 1 ? "" : "s"}
                          </td>
                          <td className="px-4 py-3">
                            {status.warn ? (
                              <HealthBadge level="ATTENTION">{status.label}</HealthBadge>
                            ) : (
                              <span className="text-zinc-400">{status.label}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-zinc-600">
                            <ChevronRight className="w-4 h-4" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden space-y-2">
                {tenantList.visible.map((tenant) => {
                  const status = tenantStatus(tenant, command);
                  return (
                    <Link key={tenant.id} href={`/platform/tenants/${tenant.id}`} className="block">
                      <Card className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{tenant.name}</p>
                            <p className="text-xs text-zinc-500 truncate">
                              {tenant.slug}
                              {tenant.billingEmail ? ` · ${tenant.billingEmail}` : ""}
                            </p>
                            <p className="text-xs text-zinc-400 mt-1">
                              {tenant.plan} · {tenant.subscriptionStatus} · {tenant.restaurants.length}{" "}
                              restaurant{tenant.restaurants.length === 1 ? "" : "s"}
                            </p>
                          </div>
                          {status.warn ? (
                            <HealthBadge level="ATTENTION">{status.label}</HealthBadge>
                          ) : (
                            <Badge className="bg-white/5 text-zinc-400 border-white/10">{status.label}</Badge>
                          )}
                        </div>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </PlatformPagedListFrame>
          </div>
        ) : (
          <RestaurantHealthTable
            rows={command?.restaurants ?? []}
            sort={sort}
            onSort={setSort}
            filter={filter}
            showTenant
            density="console"
            filters={
              <FilterPills
                value={filter}
                onChange={setFilter}
                options={[
                  { id: "all", label: "All" },
                  { id: "attention", label: "Attention" },
                  { id: "kitchen", label: "Kitchen" },
                  { id: "service", label: "Service" },
                  { id: "payments", label: "Payments" },
                  { id: "printing", label: "Printing" },
                  { id: "errors", label: "Errors" },
                ]}
              />
            }
          />
        )}
      </div>
    </PlatformShell>
  );
}

function Kpi({
  label,
  value,
  hint,
  warn,
  money,
}: {
  label: string;
  value?: string;
  hint?: string;
  warn?: boolean;
  money?: number;
}) {
  return (
    <Card className={cn("p-4 h-full", warn && "border-amber-500/40")}>
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={cn("text-2xl font-semibold mt-1", warn && "text-amber-200")}>
        {money != null ? <Money paise={money} /> : value}
      </p>
      {hint ? <p className="text-xs text-zinc-500 mt-1">{hint}</p> : null}
    </Card>
  );
}

export default function PlatformHomePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-app-shell">
          <Spinner className="w-8 h-8" />
        </div>
      }
    >
      <PlatformHomePageInner />
    </Suspense>
  );
}

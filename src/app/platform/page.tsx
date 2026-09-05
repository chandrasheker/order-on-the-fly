"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Card, Spinner } from "@/components/ui";
import { Building2, ChevronRight, Plus } from "lucide-react";
import { PlatformShell } from "@/components/platform/PlatformShell";
import {
  FilterPills,
  HealthBadge,
  Money,
  RestaurantHealthTable,
  SummaryCard,
  TimeRangeBar,
} from "@/components/platform/command-center-shared";
import {
  PlatformCollapsibleSection,
  PlatformPagedListFrame,
  PlatformRestaurantToolbar,
} from "@/components/platform/PlatformRestaurantToolbar";
import { usePagedExpandableList } from "@/hooks/usePagedExpandableList";
import { swallowPollingFetchError } from "@/lib/client-fetch";
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

export default function PlatformHomePage() {
  const router = useRouter();
  const [admin, setAdmin] = useState<{ name: string; email: string } | null>(null);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [command, setCommand] = useState<CommandCenterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("name");
  const [filter, setFilter] = useState("all");
  const [range, setRange] = useState("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tenantsOpen, setTenantsOpen] = useState(true);
  const [fleetOpen, setFleetOpen] = useState(true);

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-shell">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  const summary = command?.summary;

  return (
    <PlatformShell
      wide
      admin={admin}
      title="Platform Command Center"
      subtitle="What is happening, why, and where to investigate"
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/platform/tenants/new"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium border bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:text-white"
          >
            <Plus className="w-4 h-4" /> New tenant
          </Link>
        </div>
      }
    >
      <div className="space-y-8">
        <TimeRangeBar
          range={range}
          from={from}
          to={to}
          onRange={(value) => setRangeParams({ range: value, from, to })}
          onCustom={(nextFrom, nextTo) => setRangeParams({ range: "custom", from: nextFrom, to: nextTo })}
        />
        <p className="text-xs text-zinc-500">
          Period totals use {command?.range.label ?? range}. Active tables, kitchen backlog, staff, and printer last-seen are current.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Tenants" value={String(summary?.tenantCount ?? tenants.length)} />
          <SummaryCard label="Restaurants" value={String(summary?.restaurantCount ?? 0)} hint={`${summary?.activeNow ?? 0} active now`} />
          <SummaryCard label="Orders" value={String(summary?.orders ?? 0)} hint={command?.range.label} />
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Net captured</p>
            <p className="text-2xl font-semibold mt-1">{summary ? <Money paise={summary.netCapturedPaise} /> : "₹0"}</p>
          </Card>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Service SLA</p>
            <p className="text-2xl font-semibold mt-1">{summary?.slaLabel ?? "No eligible SLA sample"}</p>
            <p className="text-xs text-zinc-500 mt-1">{summary?.slaSample ?? 0} eligible served items</p>
          </Card>
          <button type="button" className="text-left w-full" onClick={() => setFilter("attention")}>
            <SummaryCard
              label="Need attention"
              value={String(summary?.needAttention ?? 0)}
              warn={(summary?.needAttention ?? 0) > 0}
              hint="Shows restaurants whose kitchen, payments, printing, or reliability need attention"
            />
          </button>
        </div>

        <PlatformCollapsibleSection
          title="Tenants"
          countLabel={`${tenants.length} total`}
          open={tenantsOpen}
          onToggle={() => setTenantsOpen((open) => !open)}
        >
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
            <Card className="p-8 text-center">
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
            <div className="grid gap-3">
              {tenantList.visible.map((tenant) => (
                <Link key={tenant.id} href={`/platform/tenants/${tenant.id}`} className="block group">
                  <Card className="p-5 hover:border-violet-500/40 transition-colors">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0">
                          <Building2 className="w-5 h-5 text-violet-400" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-lg font-semibold truncate group-hover:text-violet-200 transition-colors">
                            {tenant.name}
                          </h3>
                          <p className="text-sm text-zinc-500">{tenant.slug}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <Badge className="bg-white/5 text-zinc-300 border-white/10">{tenant.plan}</Badge>
                            <Badge className="bg-white/5 text-zinc-400 border-white/10">{tenant.subscriptionStatus}</Badge>
                            {tenant.isEnabled === false && (
                              <HealthBadge level="ATTENTION">Disabled</HealthBadge>
                            )}
                            <span className="text-xs text-zinc-500">
                              {tenant.restaurants.length} restaurant
                              {tenant.restaurants.length === 1 ? "" : "s"}
                            </span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-violet-400 shrink-0 transition-colors" />
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </PlatformPagedListFrame>
        </PlatformCollapsibleSection>

        <PlatformCollapsibleSection
          title="Restaurant fleet"
          countLabel={`${command?.restaurants.length ?? 0} restaurants`}
          open={fleetOpen}
          onToggle={() => setFleetOpen((open) => !open)}
        >
          <div className="flex flex-wrap items-center justify-end gap-3">
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
          </div>
          <RestaurantHealthTable
            rows={command?.restaurants ?? []}
            sort={sort}
            onSort={setSort}
            filter={filter}
            showTenant
          />
        </PlatformCollapsibleSection>
      </div>
    </PlatformShell>
  );
}

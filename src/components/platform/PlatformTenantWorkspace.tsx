"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Spinner, Button } from "@/components/ui";
import { Activity, Crown, LayoutGrid, ScrollText, Shield, Store, Users } from "lucide-react";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { PlatformStaffSetupPanel } from "@/components/platform/PlatformStaffSetupPanel";
import { PlatformFeaturesPanel } from "@/components/platform/PlatformFeaturesPanel";
import { PlatformTenantOverview } from "@/components/platform/PlatformTenantOverview";
import { PlatformScopedLogsConsole } from "@/components/platform/PlatformScopedLogsConsole";
import { ConfirmDangerDialog } from "@/components/platform/ConfirmDangerDialog";
import { FilterPills, TimeRangeBar } from "@/components/platform/command-center-shared";
import { TenantAnalyticsPanel, TenantOperationsPanel, TenantOverviewStats } from "@/components/platform/PlatformCommandPanels";
import { cn } from "@/lib/utils";
import { swallowPollingFetchError } from "@/lib/client-fetch";
import type { CommandCenterPayload } from "@/platform/command-center/types";

type TenantDetail = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  subscriptionStatus: string;
  billingEmail: string | null;
  isEnabled: boolean;
  hubActive?: boolean;
  url?: string | null;
  restaurants: Array<{
    id: string;
    name: string;
    slug: string;
    url?: string;
    isEnabled?: boolean;
    branches: Array<{ id: string; name: string; slug: string; floors: Array<{ name: string }> }>;
    _count: { users: number; orders: number; tables: number };
  }>;
};

type TenantTab = "overview" | "restaurants" | "operations" | "analytics" | "logs" | "staff" | "features";

const TABS: { id: TenantTab; label: string; icon: typeof LayoutGrid }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "restaurants", label: "Restaurants", icon: Store },
  { id: "operations", label: "Operations", icon: Activity },
  { id: "analytics", label: "Analytics", icon: Shield },
  { id: "logs", label: "Logs", icon: ScrollText },
  { id: "staff", label: "Staff", icon: Users },
  { id: "features", label: "Premium Features", icon: Crown },
];

export function PlatformTenantWorkspace() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const tenantId = String(params.tenantId ?? "");

  const initialTab = (searchParams.get("tab") as TenantTab) || "overview";
  const [tab, setTab] = useState<TenantTab>(
    TABS.some((t) => t.id === initialTab) ? initialTab : "overview",
  );
  const [admin, setAdmin] = useState<{ name: string; email: string } | null>(null);
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [tenantBaseDomain, setTenantBaseDomain] = useState("");
  const [loading, setLoading] = useState(true);
  const [togglingTenant, setTogglingTenant] = useState(false);
  const [confirmDeleteTenant, setConfirmDeleteTenant] = useState(false);
  const [deletingTenant, setDeletingTenant] = useState(false);
  const [actionError, setActionError] = useState("");
  const [command, setCommand] = useState<CommandCenterPayload | null>(null);
  const [sort, setSort] = useState("name");
  const [filter, setFilter] = useState("all");
  const range = searchParams.get("range") || "today";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const restaurantFilter = searchParams.get("restaurantId") || "";
  const preset = searchParams.get("preset") || "all";

  const replaceParams = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`/platform/tenants/${tenantId}?${params.toString()}`);
  };

  const load = useCallback(async () => {
    try {
      const meRes = await fetch("/api/platform/auth/me");
      if (!meRes.ok) {
        router.push("/platform/login");
        return;
      }
      const me = await meRes.json();
      setAdmin(me.admin);

      const res = await fetch("/api/platform/tenants");
      if (res.ok) {
        const json = await res.json();
        setTenantBaseDomain(String(json.tenantBaseDomain ?? ""));
        const found = (json.tenants ?? []).find((t: TenantDetail) => t.id === tenantId);
        if (!found) {
          router.push("/platform");
          return;
        }
        found.restaurants = [...found.restaurants].sort((a, b) => a.name.localeCompare(b.name));
        setTenant({ ...found, isEnabled: found.isEnabled ?? true });
      }
      const commandParams = new URLSearchParams({ range });
      if (range === "custom" && from && to) {
        commandParams.set("from", from);
        commandParams.set("to", to);
      }
      const commandRes = await fetch(`/api/platform/tenants/${tenantId}/command?${commandParams.toString()}`);
      if (commandRes.ok) setCommand((await commandRes.json()) as CommandCenterPayload);
    } catch (error) {
      swallowPollingFetchError(error);
    } finally {
      setLoading(false);
    }
  }, [from, range, router, tenantId, to]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- platform fetch-on-mount
    void load();
  }, [load]);

  const toggleTenant = async (enabled: boolean) => {
    if (!tenant) return;
    setTogglingTenant(true);
    setActionError("");
    try {
      const res = await fetch("/api/platform/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_tenant_enabled",
          tenantId: tenant.id,
          isEnabled: enabled,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(json.error || "Could not update tenant.");
        return;
      }
      await load();
    } catch (error) {
      swallowPollingFetchError(error);
      setActionError("Network error — try again.");
    } finally {
      setTogglingTenant(false);
    }
  };

  const deleteTenant = async () => {
    if (!tenant) return;
    setDeletingTenant(true);
    setActionError("");
    try {
      const res = await fetch("/api/platform/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_tenant",
          tenantId: tenant.id,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(json.error || "Could not delete tenant.");
        setDeletingTenant(false);
        return;
      }
      router.push("/platform");
    } catch (error) {
      swallowPollingFetchError(error);
      setActionError("Network error — try again.");
      setDeletingTenant(false);
    }
  };

  if (loading || !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-shell">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <PlatformShell
      wide
      admin={admin}
      title={tenant.name}
      subtitle={`${tenant.plan} · ${tenant.subscriptionStatus} · ${tenant.restaurants.length} restaurant${tenant.restaurants.length === 1 ? "" : "s"}${!tenant.isEnabled ? " · DISABLED" : ""}`}
      backHref="/platform"
      backLabel="All tenants"
      breadcrumb={[
        { label: "All tenants", href: "/platform" },
        { label: tenant.name },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={tenant.isEnabled ? "secondary" : "success"}
            disabled={togglingTenant || deletingTenant}
            onClick={() => void toggleTenant(!tenant.isEnabled)}
          >
            {togglingTenant ? "…" : tenant.isEnabled ? "Disable tenant" : "Enable tenant"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={deletingTenant}
            onClick={() => setConfirmDeleteTenant(true)}
          >
            Delete tenant
          </Button>
          <Link
            href={`/platform/billing?tenantId=${tenant.id}`}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium border bg-white/5 border-white/10 text-zinc-300 hover:text-white"
          >
            Billing
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
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

        {actionError && (
          <p className="text-sm text-red-400">{actionError}</p>
        )}

        {(tab === "overview" || tab === "restaurants" || tab === "operations" || tab === "analytics") && (
          <TimeRangeBar
            range={range}
            from={from}
            to={to}
            onRange={(value) => replaceParams({ range: value, from: value === "custom" ? from : null, to: value === "custom" ? to : null })}
            onCustom={(nextFrom, nextTo) => replaceParams({ range: "custom", from: nextFrom, to: nextTo })}
          />
        )}

        {tab === "overview" && (
          <div className="space-y-8">
            {command && (
              <TenantOverviewStats command={command} sort={sort} onSort={setSort} filter={filter} />
            )}
            <PlatformTenantOverview
              tenantId={tenant.id}
              tenantName={tenant.name}
              tenantSlug={tenant.slug}
              tenantUrl={tenant.url ?? null}
              tenantHubActive={Boolean(tenant.hubActive)}
              tenantEnabled={tenant.isEnabled}
              tenantBaseDomain={tenantBaseDomain}
              restaurants={tenant.restaurants}
              onRestaurantsChange={() => void load()}
              onTenantToggle={toggleTenant}
              togglingTenant={togglingTenant}
              onDeleteTenant={() => setConfirmDeleteTenant(true)}
              deletingTenant={deletingTenant}
            />
          </div>
        )}

        {tab === "restaurants" && command && (
          <div className="space-y-3">
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
            <TenantOverviewStats command={command} sort={sort} onSort={setSort} filter={filter} />
          </div>
        )}

        {tab === "operations" && command && <TenantOperationsPanel command={command} />}

        {tab === "analytics" && command && <TenantAnalyticsPanel command={command} />}

        {tab === "staff" && <PlatformStaffSetupPanel tenantId={tenant.id} />}

        {tab === "features" && <PlatformFeaturesPanel tenantId={tenant.id} />}

        {tab === "logs" && (
          <PlatformScopedLogsConsole
            endpoint={`/api/platform/tenants/${tenant.id}/logs`}
            restaurants={tenant.restaurants.map((r) => ({ id: r.id, name: r.name }))}
            restaurantId={restaurantFilter}
            onRestaurantId={(id) => replaceParams({ restaurantId: id || null })}
            initialPreset={preset}
            initialFingerprint={searchParams.get("errorFingerprint") ?? undefined}
            failedOnly={searchParams.get("failedOnly") === "1"}
            ambiguousOnly={searchParams.get("ambiguousOnly") === "1"}
            title="Tenant logs"
            subtitle="Complete forensic evidence for this tenant, including historical restaurant-scoped rows that predate tenantId."
          />
        )}
      </div>

      {confirmDeleteTenant && (
        <ConfirmDangerDialog
          title="Delete this tenant?"
          subject={`Permanently delete ${tenant.name} and every restaurant under it.`}
          details="All restaurants, staff, menus, orders, payments, and related records will be wiped from the database. This cannot be recovered."
          confirmLabel="Delete tenant permanently"
          busy={deletingTenant}
          onCancel={() => setConfirmDeleteTenant(false)}
          onConfirm={() => void deleteTenant()}
        />
      )}
    </PlatformShell>
  );
}

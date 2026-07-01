"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Spinner, Button } from "@/components/ui";
import { Crown, LayoutGrid, Shield, Users } from "lucide-react";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { PlatformStaffSetupPanel } from "@/components/platform/PlatformStaffSetupPanel";
import { PlatformFeaturesPanel } from "@/components/platform/PlatformFeaturesPanel";
import { PlatformTenantOverview } from "@/components/platform/PlatformTenantOverview";
import { PlatformLoginLogsPanel } from "@/components/platform/PlatformLoginLogsPanel";
import { cn } from "@/lib/utils";
import { swallowPollingFetchError } from "@/lib/client-fetch";

type TenantDetail = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  subscriptionStatus: string;
  billingEmail: string | null;
  isEnabled: boolean;
  restaurants: Array<{
    id: string;
    name: string;
    slug: string;
    isEnabled?: boolean;
    branches: Array<{ id: string; name: string; slug: string; floors: Array<{ name: string }> }>;
    _count: { users: number; orders: number; tables: number };
  }>;
};

type TenantTab = "overview" | "staff" | "features" | "logs";

const TABS: { id: TenantTab; label: string; icon: typeof LayoutGrid }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "staff", label: "Staff setup", icon: Users },
  { id: "features", label: "Premium features", icon: Crown },
  { id: "logs", label: "Login logs", icon: Shield },
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
  const [loading, setLoading] = useState(true);
  const [togglingTenant, setTogglingTenant] = useState(false);

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
        const found = (json.tenants ?? []).find((t: TenantDetail) => t.id === tenantId);
        if (!found) {
          router.push("/platform");
          return;
        }
        found.restaurants = [...found.restaurants].sort((a, b) => a.name.localeCompare(b.name));
        setTenant({ ...found, isEnabled: found.isEnabled ?? true });
      }
    } catch (error) {
      swallowPollingFetchError(error);
    } finally {
      setLoading(false);
    }
  }, [router, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleTenant = async (enabled: boolean) => {
    if (!tenant) return;
    setTogglingTenant(true);
    try {
      await fetch("/api/platform/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_tenant_enabled",
          tenantId: tenant.id,
          isEnabled: enabled,
        }),
      });
      await load();
    } catch (error) {
      swallowPollingFetchError(error);
    } finally {
      setTogglingTenant(false);
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
      admin={admin}
      title={tenant.name}
      subtitle={`${tenant.plan} · ${tenant.subscriptionStatus} · ${tenant.restaurants.length} restaurant${tenant.restaurants.length === 1 ? "" : "s"}${!tenant.isEnabled ? " · DISABLED" : ""}`}
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
            disabled={togglingTenant}
            onClick={() => void toggleTenant(!tenant.isEnabled)}
          >
            {togglingTenant ? "…" : tenant.isEnabled ? "Disable tenant" : "Enable tenant"}
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
              onClick={() => setTab(id)}
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

        {tab === "overview" && (
          <PlatformTenantOverview
            tenantId={tenant.id}
            tenantName={tenant.name}
            tenantEnabled={tenant.isEnabled}
            restaurants={tenant.restaurants}
            onRestaurantsChange={() => void load()}
            onTenantToggle={toggleTenant}
            togglingTenant={togglingTenant}
          />
        )}

        {tab === "staff" && <PlatformStaffSetupPanel tenantId={tenant.id} />}

        {tab === "features" && <PlatformFeaturesPanel tenantId={tenant.id} />}

        {tab === "logs" && (
          <PlatformLoginLogsPanel
            tenantId={tenant.id}
            restaurants={tenant.restaurants.map((r) => ({ id: r.id, name: r.name }))}
          />
        )}
      </div>
    </PlatformShell>
  );
}

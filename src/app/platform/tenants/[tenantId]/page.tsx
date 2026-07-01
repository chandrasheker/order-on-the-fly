"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Spinner } from "@/components/ui";
import { Crown, LayoutGrid, Users } from "lucide-react";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { PlatformStaffSetupPanel } from "@/components/platform/PlatformStaffSetupPanel";
import { PlatformFeaturesPanel } from "@/components/platform/PlatformFeaturesPanel";
import { PlatformTenantOverview } from "@/components/platform/PlatformTenantOverview";
import { cn } from "@/lib/utils";

type TenantDetail = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  subscriptionStatus: string;
  billingEmail: string | null;
  restaurants: Array<{
    id: string;
    name: string;
    slug: string;
    branches: Array<{ id: string; name: string; slug: string; floors: Array<{ name: string }> }>;
    _count: { users: number; orders: number; tables: number };
  }>;
};

type TenantTab = "overview" | "staff" | "features";

const TABS: { id: TenantTab; label: string; icon: typeof LayoutGrid }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "staff", label: "Staff setup", icon: Users },
  { id: "features", label: "Premium features", icon: Crown },
];

export default function PlatformTenantPage() {
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

  const load = useCallback(async () => {
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
      setTenant(found);
    }
    setLoading(false);
  }, [router, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

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
      subtitle={`${tenant.plan} · ${tenant.subscriptionStatus} · ${tenant.restaurants.length} restaurant${tenant.restaurants.length === 1 ? "" : "s"}`}
      breadcrumb={[
        { label: "All tenants", href: "/platform" },
        { label: tenant.name },
      ]}
      actions={
        <Link
          href={`/platform/billing?tenantId=${tenant.id}`}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium border bg-white/5 border-white/10 text-zinc-300 hover:text-white"
        >
          Billing
        </Link>
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
            restaurants={tenant.restaurants}
            onRestaurantsChange={() => void load()}
          />
        )}

        {tab === "staff" && <PlatformStaffSetupPanel tenantId={tenant.id} />}

        {tab === "features" && <PlatformFeaturesPanel tenantId={tenant.id} />}
      </div>
    </PlatformShell>
  );
}

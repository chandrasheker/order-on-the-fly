"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, Spinner } from "@/components/ui";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { swallowPollingFetchError } from "@/lib/client-fetch";

type TenantBillingState = {
  demoPackUsedAt: string | null;
  demoExpiresAt: string | null;
  isDemoActive: boolean;
  canEnableDemo: boolean;
  canSelectPlan: boolean;
  billingLockedReason: string | null;
};

type TenantBilling = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  subscriptionStatus: string;
  billingEmail: string | null;
  demoPackUsedAt: string | null;
  demoExpiresAt: string | null;
  restaurants: Array<{ id: string; name: string; slug: string }>;
  subscriptions: Array<{
    id: string;
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
    createdAt: string;
  }>;
  billing: TenantBillingState;
};

const PLANS = ["STARTER", "PRO", "ENTERPRISE"] as const;

export default function PlatformBillingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-app-shell">
          <Spinner className="w-8 h-8" />
        </div>
      }
    >
      <PlatformBillingContent />
    </Suspense>
  );
}

function PlatformBillingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetTenantId = searchParams.get("tenantId") ?? "";
  const [admin, setAdmin] = useState<{ name: string; email: string } | null>(null);
  const [tenants, setTenants] = useState<TenantBilling[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [activatingDemo, setActivatingDemo] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadTenants = useCallback(async () => {
    try {
      const me = await fetch("/api/platform/auth/me");
      if (!me.ok) {
        router.push("/platform/login");
        return;
      }
      const meJson = await me.json();
      setAdmin(meJson.admin);

      const listRes = await fetch("/api/platform/tenants");
      if (listRes.ok) {
        const json = await listRes.json();
        const ids = (json.tenants ?? []).map((t: { id: string }) => t.id);
        const details = await Promise.all(
          ids.map(async (id: string) => {
            const r = await fetch(`/api/platform/billing?tenantId=${id}`);
            return r.ok ? (await r.json()).tenant : null;
          }),
        );
        const rows = (details.filter(Boolean) as TenantBilling[]).sort((a, b) =>
          a.name.localeCompare(b.name),
        );
        setTenants(rows);
        if (presetTenantId && rows.some((t) => t.id === presetTenantId)) {
          setSelectedId(presetTenantId);
        } else if (rows[0]) {
          setSelectedId(rows[0].id);
        }
      }
    } catch (error) {
      swallowPollingFetchError(error);
    } finally {
      setLoading(false);
    }
  }, [router, presetTenantId]);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  const upgrade = async (plan: string) => {
    setUpgrading(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/platform/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: selectedId, plan, action: "set_plan" }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Upgrade failed");
        return;
      }
      setMessage(`Plan updated to ${plan}. Features for all restaurants under this tenant now match ${plan}.`);
      await loadTenants();
    } catch (error) {
      swallowPollingFetchError(error);
      setError("Network error — try again.");
    } finally {
      setUpgrading(false);
    }
  };

  const activateDemo = async () => {
    setActivatingDemo(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/platform/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: selectedId, action: "activate_demo" }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not activate demo pack");
        return;
      }
      setMessage("7-day demo pack activated. Premium features are enabled until the demo ends.");
      await loadTenants();
    } catch (error) {
      swallowPollingFetchError(error);
      setError("Network error — try again.");
    } finally {
      setActivatingDemo(false);
    }
  };

  const tenant = tenants.find((t) => t.id === selectedId);
  const billing = tenant?.billing;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <PlatformShell
      admin={admin}
      title="Billing"
      subtitle={tenant ? tenant.name : "Subscription plans per tenant"}
      breadcrumb={[
        { label: "All tenants", href: "/platform" },
        ...(tenant
          ? [{ label: tenant.name, href: `/platform/tenants/${tenant.id}` }]
          : []),
        { label: "Billing" },
      ]}
    >
      <div className="space-y-6 max-w-3xl">
        <p className="text-sm text-zinc-400">
          Billing is managed per tenant. Enable the one-time 7-day demo pack first, or choose a paid
          plan after the demo ends. Restaurants under the tenant share one subscription and feature
          set.
        </p>

        <div className="flex flex-wrap gap-2">
          {tenants.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setSelectedId(t.id);
                setMessage("");
                setError("");
              }}
              className={`px-3 py-1.5 rounded-full text-sm ${selectedId === t.id ? "bg-violet-500" : "bg-white/5"}`}
            >
              {t.name}
            </button>
          ))}
        </div>

        {tenant && billing && (
          <>
            <Card className="p-5 space-y-2">
              <p className="text-sm text-zinc-500">Current plan</p>
              <p className="text-3xl font-bold">{tenant.plan}</p>
              <p className="text-sm text-zinc-400">Status: {tenant.subscriptionStatus}</p>
              {billing.isDemoActive && billing.demoExpiresAt && (
                <p className="text-sm text-amber-300">
                  Demo pack active until {new Date(billing.demoExpiresAt).toLocaleString()}
                </p>
              )}
              {tenant.demoPackUsedAt && !billing.isDemoActive && (
                <p className="text-sm text-zinc-500">
                  Demo pack used on {new Date(tenant.demoPackUsedAt).toLocaleDateString()} (cannot
                  be re-enabled)
                </p>
              )}
              <p className="text-sm text-zinc-400">Billing: {tenant.billingEmail ?? "—"}</p>
              <p className="text-sm text-zinc-400">
                {tenant.restaurants.length} restaurant(s) on this tenant
              </p>
            </Card>

            {billing.canEnableDemo && (
              <Card className="p-5 space-y-3 border border-violet-500/30">
                <p className="font-semibold">7-day demo pack (free, one-time)</p>
                <p className="text-sm text-zinc-400">
                  Unlocks premium features across every restaurant in this tenant for 7 days. Once
                  activated, the demo pack cannot be enabled again for this tenant.
                </p>
                <Button disabled={activatingDemo} onClick={() => void activateDemo()}>
                  {activatingDemo ? "Activating…" : "Enable 7-day demo pack"}
                </Button>
              </Card>
            )}

            {billing.isDemoActive && billing.billingLockedReason && (
              <Card className="p-5 space-y-2 border border-amber-500/30">
                <p className="font-semibold text-amber-200">Demo in progress</p>
                <p className="text-sm text-zinc-400">{billing.billingLockedReason}</p>
                <p className="text-sm text-zinc-500">
                  Paid plan selection unlocks automatically when the demo period ends.
                </p>
              </Card>
            )}

            {billing.canSelectPlan ? (
              <Card className="p-5 space-y-3">
                <p className="font-semibold">Choose a plan</p>
                {tenant.subscriptionStatus === "EXPIRED" && (
                  <p className="text-sm text-zinc-400">
                    The demo has ended. Select a paid plan to restore features for this tenant.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {PLANS.map((plan) => (
                    <Button
                      key={plan}
                      variant={tenant.plan === plan && tenant.subscriptionStatus === "ACTIVE" ? "primary" : "secondary"}
                      disabled={upgrading || (tenant.plan === plan && tenant.subscriptionStatus === "ACTIVE")}
                      onClick={() => void upgrade(plan)}
                    >
                      {plan}
                    </Button>
                  ))}
                </div>
              </Card>
            ) : (
              !billing.canEnableDemo &&
              !billing.isDemoActive && (
                <Card className="p-5 space-y-2">
                  <p className="font-semibold">Plan selection</p>
                  <p className="text-sm text-zinc-400">
                    Paid plans are available here after the demo period ends or once billing is
                    activated for this tenant.
                  </p>
                </Card>
              )
            )}

            {(message || error) && (
              <p className={`text-sm ${error ? "text-red-400" : "text-emerald-400"}`}>
                {error || message}
              </p>
            )}

            <Card className="p-5">
              <p className="font-semibold mb-3">Subscription history</p>
              <ul className="space-y-2 text-sm">
                {tenant.subscriptions.map((s) => (
                  <li key={s.id} className="flex justify-between border-b border-white/5 pb-2">
                    <span>
                      {s.plan} · {s.status}
                      {s.currentPeriodEnd
                        ? ` · until ${new Date(s.currentPeriodEnd).toLocaleDateString()}`
                        : ""}
                    </span>
                    <span className="text-zinc-500">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}
      </div>
    </PlatformShell>
  );
}

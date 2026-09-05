"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

type TenantOption = { id: string; name: string };

const PLANS = ["STARTER", "PRO", "ENTERPRISE"] as const;

function readTenantIdFromLocation() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("tenantId")?.trim() ?? "";
}

function writeTenantIdToLocation(tenantId: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (tenantId) url.searchParams.set("tenantId", tenantId);
  else url.searchParams.delete("tenantId");
  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
}

export default function PlatformBillingPage() {
  const router = useRouter();
  const [admin, setAdmin] = useState<{ name: string; email: string } | null>(null);
  const [presetTenantId, setPresetTenantId] = useState("");
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [tenant, setTenant] = useState<TenantBilling | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [activatingDemo, setActivatingDemo] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const fetchBilling = useCallback(async (tenantId: string) => {
    const res = await fetch(`/api/platform/billing?tenantId=${encodeURIComponent(tenantId)}`, {
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { tenant?: TenantBilling; error?: string };
    if (!res.ok || !json.tenant) {
      throw new Error(json.error || "Failed to load billing");
    }
    return json.tenant;
  }, []);

  const selectTenant = useCallback(
    async (tenantId: string, options: TenantOption[] = tenantOptions) => {
      setSelectedId(tenantId);
      writeTenantIdToLocation(tenantId);
      setDetailLoading(true);
      setError("");
      try {
        const detail = await fetchBilling(tenantId);
        setTenant(detail);
        if (!options.some((item) => item.id === detail.id)) {
          setTenantOptions([...options, { id: detail.id, name: detail.name }].sort((a, b) =>
            a.name.localeCompare(b.name),
          ));
        }
      } catch (err) {
        setTenant(null);
        setError(err instanceof Error ? err.message : "Failed to load billing");
      } finally {
        setDetailLoading(false);
      }
    },
    [fetchBilling, tenantOptions],
  );

  useEffect(() => {
    void (async () => {
      try {
        const me = await fetch("/api/platform/auth/me");
        if (!me.ok) {
          router.push("/platform/login");
          return;
        }
        const meJson = await me.json();
        setAdmin(meJson.admin);

        const urlTenantId = readTenantIdFromLocation();
        setPresetTenantId(urlTenantId);

        const listRes = await fetch("/api/platform/tenants", { cache: "no-store" });
        const listJson = listRes.ok
          ? ((await listRes.json()) as { tenants?: TenantOption[] })
          : { tenants: [] };
        const options = (listJson.tenants ?? [])
          .map((item) => ({ id: item.id, name: item.name }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setTenantOptions(options);

        const targetId = urlTenantId || options[0]?.id || "";
        setSelectedId(targetId);

        if (!targetId) {
          if (!listRes.ok) setError("Could not load tenants.");
          return;
        }

        try {
          const detail = await fetchBilling(targetId);
          setTenant(detail);
          if (!options.some((item) => item.id === detail.id)) {
            setTenantOptions(
              [...options, { id: detail.id, name: detail.name }].sort((a, b) =>
                a.name.localeCompare(b.name),
              ),
            );
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to load billing");
        }
      } catch (err) {
        swallowPollingFetchError(err);
        setError("Network error — try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchBilling, router]);

  const upgrade = async (plan: string) => {
    if (!selectedId) return;
    setUpgrading(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/platform/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: selectedId, plan, action: "set_plan" }),
      });
      const json = (await res.json()) as { error?: string; tenant?: TenantBilling };
      if (!res.ok || !json.tenant) {
        setError(json.error || "Upgrade failed");
        return;
      }
      setTenant(json.tenant);
      setMessage(`Plan updated to ${plan}. Features for all restaurants under this tenant now match ${plan}.`);
    } catch (err) {
      swallowPollingFetchError(err);
      setError("Network error — try again.");
    } finally {
      setUpgrading(false);
    }
  };

  const activateDemo = async () => {
    if (!selectedId) return;
    setActivatingDemo(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/platform/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: selectedId, action: "activate_demo" }),
      });
      const json = (await res.json()) as { error?: string; tenant?: TenantBilling };
      if (!res.ok || !json.tenant) {
        setError(json.error || "Could not activate demo pack");
        return;
      }
      setTenant(json.tenant);
      setMessage("7-day demo pack activated. Premium features are enabled until the demo ends.");
    } catch (err) {
      swallowPollingFetchError(err);
      setError("Network error — try again.");
    } finally {
      setActivatingDemo(false);
    }
  };

  const billing = tenant?.billing;
  const backTenantId = selectedId || presetTenantId;

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
      backHref={backTenantId ? `/platform/tenants/${backTenantId}` : "/platform"}
      backLabel={backTenantId ? "Tenant overview" : "All tenants"}
      breadcrumb={[
        { label: "All tenants", href: "/platform" },
        ...(tenant
          ? [{ label: tenant.name, href: `/platform/tenants/${tenant.id}` }]
          : backTenantId
            ? [{ label: "Tenant", href: `/platform/tenants/${backTenantId}` }]
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
          {tenantOptions.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setMessage("");
                void selectTenant(item.id);
              }}
              className={`px-3 py-1.5 rounded-full text-sm ${selectedId === item.id ? "bg-violet-500" : "bg-white/5"}`}
            >
              {item.name}
            </button>
          ))}
        </div>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-400">{message}</p> : null}

        {detailLoading ? (
          <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-zinc-400">
            Loading billing…
          </p>
        ) : null}

        {tenant && billing && !detailLoading && (
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

            <Card className="p-5">
              <p className="font-semibold mb-3">Subscription history</p>
              {tenant.subscriptions.length === 0 ? (
                <p className="text-sm text-zinc-500">No subscription history yet.</p>
              ) : (
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
              )}
            </Card>
          </>
        )}
      </div>
    </PlatformShell>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CreditCard } from "lucide-react";
import { Button, Card, Spinner } from "@/components/ui";

type TenantBilling = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  subscriptionStatus: string;
  billingEmail: string | null;
  restaurants: Array<{ id: string; name: string; slug: string }>;
  subscriptions: Array<{
    id: string;
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
    createdAt: string;
  }>;
};

const PLANS = ["STARTER", "PRO", "ENTERPRISE"] as const;

export default function PlatformBillingPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantBilling[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [message, setMessage] = useState("");

  const loadTenants = useCallback(async () => {
    const me = await fetch("/api/platform/auth/me");
    if (!me.ok) {
      router.push("/platform/login");
      return;
    }
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
      const rows = details.filter(Boolean) as TenantBilling[];
      setTenants(rows);
      if (rows[0]) setSelectedId(rows[0].id);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  const upgrade = async (plan: string) => {
    setUpgrading(true);
    setMessage("");
    const res = await fetch("/api/platform/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: selectedId, plan }),
    });
    const json = await res.json();
    setUpgrading(false);
    if (!res.ok) {
      setMessage(json.error || "Upgrade failed");
      return;
    }
    setMessage(`Plan updated to ${plan}`);
    await loadTenants();
  };

  const tenant = tenants.find((t) => t.id === selectedId);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-white/10 px-4 py-4 max-w-3xl mx-auto flex items-center gap-3">
        <Link href="/platform/tenants" className="p-2 rounded-xl bg-white/5">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <CreditCard className="w-5 h-5 text-violet-400" />
        <h1 className="text-lg font-bold">Billing portal</h1>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-wrap gap-2">
          {tenants.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedId(t.id)}
              className={`px-3 py-1.5 rounded-full text-sm ${selectedId === t.id ? "bg-violet-500" : "bg-white/5"}`}
            >
              {t.name}
            </button>
          ))}
        </div>

        {tenant && (
          <>
            <Card className="p-5 space-y-2">
              <p className="text-sm text-zinc-500">Current plan</p>
              <p className="text-3xl font-bold">{tenant.plan}</p>
              <p className="text-sm text-zinc-400">Status: {tenant.subscriptionStatus}</p>
              <p className="text-sm text-zinc-400">Billing: {tenant.billingEmail ?? "—"}</p>
              <p className="text-sm text-zinc-400">{tenant.restaurants.length} restaurant(s) on this tenant</p>
            </Card>

            <Card className="p-5 space-y-3">
              <p className="font-semibold">Change plan</p>
              <div className="flex flex-wrap gap-2">
                {PLANS.map((plan) => (
                  <Button
                    key={plan}
                    variant={tenant.plan === plan ? "primary" : "secondary"}
                    disabled={upgrading || tenant.plan === plan}
                    onClick={() => void upgrade(plan)}
                  >
                    {plan}
                  </Button>
                ))}
              </div>
              {message && <p className="text-sm text-emerald-400">{message}</p>}
            </Card>

            <Card className="p-5">
              <p className="font-semibold mb-3">Subscription history</p>
              <ul className="space-y-2 text-sm">
                {tenant.subscriptions.map((s) => (
                  <li key={s.id} className="flex justify-between border-b border-white/5 pb-2">
                    <span>{s.plan} · {s.status}</span>
                    <span className="text-zinc-500">{new Date(s.createdAt).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

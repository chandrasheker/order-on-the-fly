"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Plus, Layers, ChevronDown, ChevronUp } from "lucide-react";
import { Button, Card, Input, Spinner } from "@/components/ui";
import { PlatformRestaurantToolbar } from "@/components/platform/PlatformRestaurantToolbar";
import { useRestaurantSearch } from "@/hooks/useRestaurantSearch";

type TenantRow = {
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

export default function PlatformTenantsPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTenant, setSelectedTenant] = useState<string>("");
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [addRestaurant, setAddRestaurant] = useState({ name: "", slug: "", ownerEmail: "", ownerName: "Owner" });
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const me = await fetch("/api/platform/auth/me");
    if (!me.ok) {
      router.push("/platform/login");
      return;
    }
    const res = await fetch("/api/platform/tenants");
    if (res.ok) {
      const json = await res.json();
      setTenants(json.tenants ?? []);
      if (json.tenants?.[0]) setSelectedTenant(json.tenants[0].id);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedTenant) return;
    void fetch(`/api/platform/tenants/${selectedTenant}/overview`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setOverview);
  }, [selectedTenant]);

  const submitRestaurant = async () => {
    setMessage("");
    const res = await fetch("/api/platform/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_restaurant", tenantId: selectedTenant, ...addRestaurant }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.error || "Failed");
      return;
    }
    setMessage(`Added ${json.restaurant.name}`);
    setAddRestaurant({ name: "", slug: "", ownerEmail: "", ownerName: "Owner" });
    await load();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  const stats = overview?.stats as Record<string, number> | undefined;

  const selectedTenantData = tenants.find((t) => t.id === selectedTenant);
  const tenantRestaurants = selectedTenantData?.restaurants ?? [];
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
  } = useRestaurantSearch(tenantRestaurants);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-white/10 px-4 py-4 max-w-5xl mx-auto flex items-center gap-3">
        <Link href="/platform" className="p-2 rounded-xl bg-white/5">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-lg font-bold">Tenants & restaurants</h1>
        <Link href="/platform/billing" className="ml-auto text-sm text-violet-400 underline">
          Billing portal
        </Link>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-wrap gap-2">
          {tenants.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedTenant(t.id)}
              className={`px-3 py-1.5 rounded-full text-sm ${selectedTenant === t.id ? "bg-violet-500" : "bg-white/5 text-zinc-400"}`}
            >
              {t.name}
            </button>
          ))}
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ["Restaurants", stats.restaurantCount],
              ["Orders today", stats.ordersToday],
              ["Total orders", stats.totalOrders],
              ["Staff", stats.totalStaff],
            ].map(([label, value]) => (
              <Card key={String(label)} className="p-4">
                <p className="text-xs text-zinc-500">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
              </Card>
            ))}
          </div>
        )}

        {tenants
          .filter((t) => t.id === selectedTenant)
          .map((tenant) => (
            <div key={tenant.id} className="space-y-4">
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="w-5 h-5 text-violet-400" />
                  <h2 className="font-semibold">{tenant.name}</h2>
                  <span className="text-xs text-zinc-500 ml-2">{tenant.plan} · {tenant.subscriptionStatus}</span>
                </div>

                {tenant.restaurants.length > 0 && (
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
                )}

                <div className="space-y-2">
                  {filteredRestaurants.length === 0 && search.trim() && (
                    <p className="text-sm text-center text-zinc-500 py-6">No restaurants match your search.</p>
                  )}
                  {filteredRestaurants.map((r) => {
                    const open = isExpanded(r.id);
                    return (
                    <div key={r.id} className="rounded-xl border border-white/10 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(r.id)}
                        className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] transition-colors"
                        aria-expanded={open}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {open ? (
                            <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="font-medium truncate">{r.name}</p>
                            <p className="text-xs text-zinc-500">/{r.slug}</p>
                          </div>
                        </div>
                        <p className="text-xs text-zinc-500 shrink-0">
                          {r._count.tables} tables · {r._count.users} staff
                        </p>
                      </button>
                      {open && (
                      <div className="px-4 pb-4 pt-0 border-t border-white/5 space-y-2">
                      <p className="text-xs text-zinc-500 pt-3">
                        {r._count.tables} tables · {r._count.users} staff · {r._count.orders} orders
                      </p>
                      <p className="text-xs text-emerald-400">
                        Guest: /order/{r.slug}/{r.slug}-table-1/check-in
                      </p>
                      {r.branches.map((b) => (
                        <p key={b.id} className="text-xs text-zinc-400 flex items-center gap-1">
                          <Layers className="w-3 h-3" /> {b.name} — {b.floors.map((f) => f.name).join(", ")}
                        </p>
                      ))}
                      </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              </Card>

              <Card className="p-5 space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Add restaurant to tenant
                </h3>
                <div className="grid md:grid-cols-2 gap-2">
                  <Input placeholder="Restaurant name" value={addRestaurant.name} onChange={(e) => setAddRestaurant({ ...addRestaurant, name: e.target.value })} />
                  <Input placeholder="Slug (optional)" value={addRestaurant.slug} onChange={(e) => setAddRestaurant({ ...addRestaurant, slug: e.target.value })} />
                  <Input placeholder="Owner email" value={addRestaurant.ownerEmail} onChange={(e) => setAddRestaurant({ ...addRestaurant, ownerEmail: e.target.value })} />
                  <Input placeholder="Owner name" value={addRestaurant.ownerName} onChange={(e) => setAddRestaurant({ ...addRestaurant, ownerName: e.target.value })} />
                </div>
                <Button onClick={() => void submitRestaurant()}>Add restaurant</Button>
                {message && <p className="text-sm text-emerald-400">{message}</p>}
              </Card>
            </div>
          ))}
      </main>
    </div>
  );
}

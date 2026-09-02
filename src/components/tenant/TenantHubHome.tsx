"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Spinner } from "@/components/ui";
import { Building2, ExternalLink } from "lucide-react";
import { swallowPollingFetchError } from "@/lib/client-fetch";

type Overview = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    subscriptionStatus: string;
    isEnabled: boolean;
    hubActive: boolean;
    url: string | null;
  };
  restaurants: Array<{
    id: string;
    name: string;
    slug: string;
    url: string;
    isEnabled: boolean;
    _count: { users: number; orders: number; tables: number };
    activeSessions: { total: number };
  }>;
  stats: {
    restaurantCount: number;
    ordersToday: number;
    totalOrders: number;
    totalStaff: number;
    totalTables: number;
    activeLogins: number;
  };
};

export function TenantHubHome() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [admin, setAdmin] = useState<{ name: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const me = await fetch("/api/tenant-admin/auth/me");
      if (!me.ok) {
        router.push("/tenant/login");
        return;
      }
      const meJson = await me.json();
      setAdmin(meJson.admin);
      const res = await fetch("/api/tenant-admin/overview", { cache: "no-store" });
      if (!res.ok) {
        router.push("/tenant/login");
        return;
      }
      setOverview(await res.json());
    } catch (error) {
      swallowPollingFetchError(error);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const logout = async () => {
    await fetch("/api/tenant-admin/auth/logout", { method: "POST" });
    router.push("/tenant/login");
  };

  if (loading || !overview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-shell">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  const { tenant, restaurants, stats } = overview;

  return (
    <div className="min-h-screen bg-app-shell text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-zinc-500">Tenant admin</p>
          <h1 className="text-2xl font-bold">{tenant.name}</h1>
          <p className="text-sm text-zinc-400">
            {tenant.plan} · {tenant.subscriptionStatus}
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

      <main className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            ["Restaurants", stats.restaurantCount],
            ["Active logins", stats.activeLogins],
            ["Orders today", stats.ordersToday],
            ["Total orders", stats.totalOrders],
            ["Staff accounts", stats.totalStaff],
          ].map(([label, value]) => (
            <Card key={String(label)} className="p-4">
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="text-2xl font-bold">{value}</p>
            </Card>
          ))}
        </div>

        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-violet-400" />
            <h2 className="font-semibold">Restaurants</h2>
          </div>
          <div className="space-y-2">
            {restaurants.map((restaurant) => (
              <div
                key={restaurant.id}
                className="rounded-xl border border-white/10 p-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{restaurant.name}</p>
                    {!restaurant.isEnabled && (
                      <Badge className="bg-red-500/15 text-red-400 border-red-500/30">Disabled</Badge>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 break-all">{restaurant.url}</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {restaurant._count.tables} tables · {restaurant._count.users} staff ·{" "}
                    {restaurant.activeSessions.total} logged in
                  </p>
                </div>
                <a href={restaurant.url} className="shrink-0">
                  <Button size="sm" variant="secondary">
                    <ExternalLink className="w-4 h-4" /> Open
                  </Button>
                </a>
              </div>
            ))}
          </div>
        </Card>
      </main>
    </div>
  );
}

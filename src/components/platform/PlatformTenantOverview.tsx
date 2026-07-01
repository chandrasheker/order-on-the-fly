"use client";

import { useEffect, useState } from "react";
import { Building2, Plus, ChevronDown, ChevronUp, Layers } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import { PlatformRestaurantToolbar } from "@/components/platform/PlatformRestaurantToolbar";
import { useRestaurantSearch } from "@/hooks/useRestaurantSearch";

type TenantRestaurant = {
  id: string;
  name: string;
  slug: string;
  branches: Array<{ id: string; name: string; slug: string; floors: Array<{ name: string }> }>;
  _count: { users: number; orders: number; tables: number };
};

interface PlatformTenantOverviewProps {
  tenantId: string;
  tenantName: string;
  restaurants: TenantRestaurant[];
  onRestaurantsChange: () => void;
}

export function PlatformTenantOverview({
  tenantId,
  tenantName,
  restaurants,
  onRestaurantsChange,
}: PlatformTenantOverviewProps) {
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [addRestaurant, setAddRestaurant] = useState({
    name: "",
    slug: "",
    ownerEmail: "",
    ownerName: "Owner",
  });
  const [message, setMessage] = useState("");

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
  } = useRestaurantSearch(restaurants);

  useEffect(() => {
    void fetch(`/api/platform/tenants/${tenantId}/overview`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setOverview);
  }, [tenantId]);

  const submitRestaurant = async () => {
    setMessage("");
    const res = await fetch("/api/platform/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add_restaurant",
        tenantId,
        ...addRestaurant,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.error || "Failed");
      return;
    }
    setMessage(`Added ${json.restaurant.name}`);
    setAddRestaurant({ name: "", slug: "", ownerEmail: "", ownerName: "Owner" });
    onRestaurantsChange();
  };

  const stats = overview?.stats as Record<string, number> | undefined;

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-400">
        Restaurants belonging to <span className="text-zinc-200">{tenantName}</span>. Staff setup and
        premium features are managed per restaurant on the other tabs.
      </p>

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

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-5 h-5 text-violet-400" />
          <h2 className="font-semibold">Restaurants in this tenant</h2>
        </div>

        {restaurants.length === 0 ? (
          <p className="text-sm text-zinc-500 py-6 text-center">
            No restaurants yet. Add the first one below.
          </p>
        ) : (
          <>
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

            <div className="space-y-2">
              {filteredRestaurants.length === 0 && search.trim() && (
                <p className="text-sm text-center text-zinc-500 py-6">
                  No restaurants match your search.
                </p>
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
                          {r._count.tables} tables · {r._count.users} staff · {r._count.orders}{" "}
                          orders
                        </p>
                        <p className="text-xs text-emerald-400">
                          Guest check-in: /order/{r.slug}/{r.slug}-table-1/check-in
                        </p>
                        {r.branches.map((b) => (
                          <p key={b.id} className="text-xs text-zinc-400 flex items-center gap-1">
                            <Layers className="w-3 h-3" /> {b.name} —{" "}
                            {b.floors.map((f) => f.name).join(", ")}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add restaurant to {tenantName}
        </h3>
        <div className="grid md:grid-cols-2 gap-2">
          <Input
            placeholder="Restaurant name"
            value={addRestaurant.name}
            onChange={(e) => setAddRestaurant({ ...addRestaurant, name: e.target.value })}
          />
          <Input
            placeholder="Slug (optional)"
            value={addRestaurant.slug}
            onChange={(e) => setAddRestaurant({ ...addRestaurant, slug: e.target.value })}
          />
          <Input
            placeholder="Owner email"
            value={addRestaurant.ownerEmail}
            onChange={(e) => setAddRestaurant({ ...addRestaurant, ownerEmail: e.target.value })}
          />
          <Input
            placeholder="Owner name"
            value={addRestaurant.ownerName}
            onChange={(e) => setAddRestaurant({ ...addRestaurant, ownerName: e.target.value })}
          />
        </div>
        <Button onClick={() => void submitRestaurant()}>Add restaurant</Button>
        {message && (
          <p className={`text-sm ${message.startsWith("Added") ? "text-emerald-400" : "text-red-400"}`}>
            {message}
          </p>
        )}
      </Card>
    </div>
  );
}

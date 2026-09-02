"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card, Input } from "@/components/ui";
import { Plus, Trash2 } from "lucide-react";
import { previewHostnames, MULTI_RESTAURANT_SAME_NAME_ERROR } from "@/lib/hostname-rules";

type RestaurantDraft = {
  name: string;
  ownerEmail: string;
  ownerName: string;
  ownerPassword: string;
  tableCount: string;
};

function emptyRestaurant(): RestaurantDraft {
  return { name: "", ownerEmail: "", ownerName: "Owner", ownerPassword: "", tableCount: "6" };
}

export function PlatformCreateTenantForm({ baseDomain }: { baseDomain: string }) {
  const [tenantName, setTenantName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [restaurants, setRestaurants] = useState<RestaurantDraft[]>([emptyRestaurant()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const preview = useMemo(() => {
    try {
      const names = restaurants.map((restaurant) => restaurant.name).filter((name) => name.trim());
      if (!tenantName.trim() || names.length === 0) return null;
      return previewHostnames({ tenantName, restaurantNames: names, baseDomain });
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Invalid names" };
    }
  }, [tenantName, restaurants, baseDomain]);

  const namingWarning =
    restaurants.length > 1 &&
    restaurants.some(
      (restaurant) =>
        restaurant.name.trim() &&
        restaurant.name.trim().toLowerCase() === tenantName.trim().toLowerCase(),
    )
      ? MULTI_RESTAURANT_SAME_NAME_ERROR
      : "";

  const addRestaurant = () => setRestaurants((current) => [...current, emptyRestaurant()]);
  const removeRestaurant = (index: number) => {
    setRestaurants((current) => (current.length === 1 ? current : current.filter((_, i) => i !== index)));
  };

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/platform/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_tenant",
          tenantName,
          billingEmail,
          restaurants: restaurants.map((restaurant) => ({
            name: restaurant.name,
            ownerEmail: restaurant.ownerEmail,
            ownerName: restaurant.ownerName,
            ownerPassword: restaurant.ownerPassword,
            tableCount: Number(restaurant.tableCount) || 6,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    const tenant = (result.tenant ?? {}) as { name?: string; url?: string | null };
    const created = (result.restaurants ?? []) as Array<{ name?: string; url?: string }>;
    return (
      <Card className="p-8 space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold text-emerald-400">Tenant created</h1>
        <p>
          <strong>{tenant.name}</strong>
        </p>
        {tenant.url && (
          <p className="text-sm">
            Tenant dashboard:{" "}
            <a href={tenant.url} className="text-orange-300 underline break-all">
              {tenant.url}
            </a>
          </p>
        )}
        <ul className="text-sm space-y-2">
          {created.map((restaurant) => (
            <li key={restaurant.url}>
              {restaurant.name}:{" "}
              <a href={restaurant.url} className="text-orange-300 underline break-all">
                {restaurant.url}
              </a>
            </li>
          ))}
        </ul>
        <Link href="/platform">
          <Button>Back to tenants</Button>
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">Tenant information</h2>
        <Input
          placeholder="Tenant name"
          value={tenantName}
          onChange={(e) => setTenantName(e.target.value)}
        />
        <Input
          placeholder="Billing email"
          value={billingEmail}
          onChange={(e) => setBillingEmail(e.target.value)}
        />
      </Card>

      {restaurants.map((restaurant, index) => (
        <Card key={index} className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Restaurant {index + 1}</h2>
            {restaurants.length > 1 && (
              <Button type="button" size="sm" variant="danger" onClick={() => removeRestaurant(index)}>
                <Trash2 className="w-4 h-4" /> Remove restaurant
              </Button>
            )}
          </div>
          <div className="grid md:grid-cols-2 gap-2">
            <Input
              placeholder="Restaurant name"
              value={restaurant.name}
              onChange={(e) => {
                const next = [...restaurants];
                next[index] = { ...restaurant, name: e.target.value };
                setRestaurants(next);
              }}
            />
            <Input
              placeholder="Tables"
              value={restaurant.tableCount}
              onChange={(e) => {
                const next = [...restaurants];
                next[index] = { ...restaurant, tableCount: e.target.value };
                setRestaurants(next);
              }}
            />
            <Input
              placeholder="Owner email"
              value={restaurant.ownerEmail}
              onChange={(e) => {
                const next = [...restaurants];
                next[index] = { ...restaurant, ownerEmail: e.target.value };
                setRestaurants(next);
              }}
            />
            <Input
              placeholder="Owner name"
              value={restaurant.ownerName}
              onChange={(e) => {
                const next = [...restaurants];
                next[index] = { ...restaurant, ownerName: e.target.value };
                setRestaurants(next);
              }}
            />
            <Input
              type="password"
              placeholder="Owner password"
              value={restaurant.ownerPassword}
              onChange={(e) => {
                const next = [...restaurants];
                next[index] = { ...restaurant, ownerPassword: e.target.value };
                setRestaurants(next);
              }}
            />
          </div>
        </Card>
      ))}

      <Button type="button" variant="secondary" onClick={addRestaurant}>
        <Plus className="w-4 h-4" /> Add restaurant
      </Button>

      {preview && "error" in preview && preview.error && (
        <p className="text-sm text-red-400">{preview.error}</p>
      )}
      {namingWarning && <p className="text-sm text-red-400">{namingWarning}</p>}
      {preview && "restaurants" in preview && (
        <Card className="p-4 text-sm space-y-1">
          {preview.tenantUrl && (
            <p>
              Tenant dashboard: <span className="text-orange-300">{preview.tenantUrl}</span>
            </p>
          )}
          {preview.restaurants.map((restaurant) => (
            <p key={restaurant.slug}>
              Restaurant URL for {restaurant.name}:{" "}
              <span className="text-orange-300">{restaurant.url}</span>
            </p>
          ))}
        </Card>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button onClick={() => void submit()} disabled={loading || Boolean(namingWarning)}>
        {loading ? "Creating…" : "Create tenant"}
      </Button>
    </div>
  );
}

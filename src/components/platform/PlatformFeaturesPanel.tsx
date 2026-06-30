"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Spinner, Badge } from "@/components/ui";
import { Crown, Save, Sparkles } from "lucide-react";
import type { FeatureKey } from "@/lib/feature-catalog";

type FeatureRow = {
  key: FeatureKey;
  name: string;
  problem: string;
  tier: "core" | "premium" | "roadmap";
  defaultEnabled: boolean;
  enabled: boolean;
  roadmap?: boolean;
};

type RestaurantFeatures = {
  id: string;
  name: string;
  slug: string;
  features: FeatureRow[];
};

export function PlatformFeaturesPanel() {
  const [restaurants, setRestaurants] = useState<RestaurantFeatures[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Record<FeatureKey, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/platform/features");
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = await res.json();
    const list = data.restaurants as RestaurantFeatures[];
    setRestaurants(list);
    const next: typeof drafts = {};
    for (const r of list) {
      next[r.id] = Object.fromEntries(r.features.map((f) => [f.key, f.enabled])) as Record<
        FeatureKey,
        boolean
      >;
    }
    setDrafts(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (restaurantId: string, key: FeatureKey, enabled: boolean) => {
    setDrafts((prev) => ({
      ...prev,
      [restaurantId]: { ...prev[restaurantId], [key]: enabled },
    }));
  };

  const save = async (restaurantId: string) => {
    setSavingId(restaurantId);
    setMessage(null);
    const res = await fetch("/api/platform/features", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, updates: drafts[restaurantId] }),
    });
    if (res.ok) {
      const data = await res.json();
      setMessage({ type: "ok", text: data.message });
      await load();
    } else {
      const data = await res.json();
      setMessage({ type: "err", text: data.error || "Save failed" });
    }
    setSavingId(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-400">
        Toggle premium modules per restaurant. Changes apply within ~10 seconds — no app restart.
        Restaurant owners never see disabled features in their UI.
      </p>

      {message && (
        <p
          className={`text-sm text-center ${
            message.type === "ok" ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {message.text}
        </p>
      )}

      {restaurants.map((restaurant) => {
        const premium = restaurant.features.filter((f) => f.tier === "premium");
        const roadmap = restaurant.features.filter((f) => f.tier === "roadmap");
        const draft = drafts[restaurant.id] ?? {};

        return (
          <Card key={restaurant.id} className="p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Crown className="w-5 h-5 text-amber-400" />
                  {restaurant.name}
                </h2>
                <p className="text-xs text-zinc-500">{restaurant.slug}</p>
              </div>
              <Button onClick={() => save(restaurant.id)} disabled={savingId === restaurant.id}>
                {savingId === restaurant.id ? (
                  <Spinner />
                ) : (
                  <>
                    <Save className="w-4 h-4" /> Save feature toggles
                  </>
                )}
              </Button>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-amber-300/90">Premium (billable)</h3>
              {premium.map((feature) => (
                <label
                  key={feature.key}
                  className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 cursor-pointer hover:border-amber-500/30"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={draft[feature.key] ?? feature.enabled}
                    onChange={(e) => toggle(restaurant.id, feature.key, e.target.checked)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{feature.name}</span>
                      <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30">
                        Premium
                      </Badge>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">{feature.problem}</p>
                  </div>
                </label>
              ))}
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-violet-300/90 flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Roadmap (early access toggles)
              </h3>
              {roadmap.map((feature) => (
                <label
                  key={feature.key}
                  className="flex items-start gap-3 rounded-xl border border-dashed border-white/10 bg-white/[0.01] p-4 cursor-pointer opacity-90"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={draft[feature.key] ?? feature.enabled}
                    onChange={(e) => toggle(restaurant.id, feature.key, e.target.checked)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{feature.name}</span>
                      {feature.roadmap ? (
                        <Badge className="bg-violet-500/15 text-violet-300 border-violet-500/30">
                          Coming soon
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                          Live
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">{feature.problem}</p>
                  </div>
                </label>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

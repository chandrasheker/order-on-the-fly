"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, Key, ChefHat, TrendingUp, Building2 } from "lucide-react";
import { Button, Card, Input, Spinner } from "@/components/ui";

type Tab = "analytics" | "forecasts" | "apikeys" | "recipes" | "branches";

export default function PlatformAdminPage() {
  const [tab, setTab] = useState<Tab>("analytics");
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<Record<string, unknown> | null>(null);
  const [forecasts, setForecasts] = useState<Record<string, unknown> | null>(null);
  const [keys, setKeys] = useState<Array<Record<string, unknown>>>([]);
  const [ingredients, setIngredients] = useState<Array<Record<string, unknown>>>([]);
  const [branches, setBranches] = useState<Array<Record<string, unknown>>>([]);
  const [newKeySecret, setNewKeySecret] = useState<string | null>(null);
  const [ingName, setIngName] = useState("");
  const [branchName, setBranchName] = useState("");

  const load = async () => {
    setLoading(true);
    const [a, f, k, r, b] = await Promise.all([
      fetch("/api/analytics").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/forecasts").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/api-keys").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/recipes").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/branches").then((r) => (r.ok ? r.json() : null)),
    ]);
    setAnalytics(a);
    setForecasts(f);
    setKeys(k?.keys ?? []);
    setIngredients(r?.ingredients ?? []);
    setBranches(b?.branches ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const tabs: Array<{ id: Tab; label: string; icon: typeof BarChart3 }> = [
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "forecasts", label: "Forecasts", icon: TrendingUp },
    { id: "apikeys", label: "API keys", icon: Key },
    { id: "recipes", label: "Recipes", icon: ChefHat },
    { id: "branches", label: "Branches", icon: Building2 },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-white/10 px-4 py-4 max-w-5xl mx-auto flex items-center gap-3">
        <Link href="/staff/dashboard" className="p-2 rounded-xl bg-white/5">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-lg font-bold">Platform ops</h1>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-full text-sm flex items-center gap-1.5 ${
                tab === t.id ? "bg-violet-500 text-white" : "bg-white/5 text-zinc-400"
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === "analytics" && analytics && (
          <Card className="p-4 space-y-3">
            <h2 className="font-semibold">Today</h2>
            <p>Orders: {String((analytics.summary as Record<string, unknown>)?.orders ?? 0)}</p>
            <p>Revenue: ₹{String((analytics.summary as Record<string, unknown>)?.revenue ?? 0)}</p>
            <p>Events: {String((analytics.summary as Record<string, unknown>)?.events ?? 0)}</p>
          </Card>
        )}

        {tab === "forecasts" && forecasts && (
          <Card className="p-4 space-y-3">
            <p className="text-sm text-zinc-400">
              {(forecasts.insights as Record<string, unknown>)?.recommendation as string}
            </p>
            <Button
              onClick={async () => {
                await fetch("/api/forecasts", { method: "POST" });
                void load();
              }}
            >
              Regenerate forecasts
            </Button>
            <ul className="text-sm space-y-1">
              {((forecasts.forecasts as Array<Record<string, unknown>>) ?? []).slice(0, 10).map((f) => (
                <li key={String(f.id)}>
                  {String(f.menuItemName)} — {String(f.predictedQuantity)} ({Math.round(Number(f.confidence) * 100)}%)
                </li>
              ))}
            </ul>
          </Card>
        )}

        {tab === "apikeys" && (
          <Card className="p-4 space-y-3">
            <Button
              onClick={async () => {
                const res = await fetch("/api/api-keys", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: "Integration" }),
                });
                const json = await res.json();
                if (json.secret) setNewKeySecret(json.secret);
                void load();
              }}
            >
              Create API key
            </Button>
            {newKeySecret && (
              <p className="text-xs text-emerald-400 break-all">Secret (copy now): {newKeySecret}</p>
            )}
            <ul className="text-sm space-y-1">
              {keys.map((k) => (
                <li key={String(k.id)}>
                  {String(k.name)} · {String(k.keyPrefix)}…
                </li>
              ))}
            </ul>
          </Card>
        )}

        {tab === "recipes" && (
          <Card className="p-4 space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Ingredient name" value={ingName} onChange={(e) => setIngName(e.target.value)} />
              <Button
                onClick={async () => {
                  await fetch("/api/recipes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: ingName }),
                  });
                  setIngName("");
                  void load();
                }}
              >
                Add
              </Button>
            </div>
            <ul className="text-sm space-y-1">
              {ingredients.map((i) => (
                <li key={String(i.id)}>
                  {String(i.name)} — {String(i.stockQuantity)} {String(i.unit)}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {tab === "branches" && (
          <Card className="p-4 space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Branch name" value={branchName} onChange={(e) => setBranchName(e.target.value)} />
              <Button
                onClick={async () => {
                  await fetch("/api/branches", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: branchName }),
                  });
                  setBranchName("");
                  void load();
                }}
              >
                Add branch
              </Button>
            </div>
            <ul className="text-sm space-y-1">
              {branches.map((b) => (
                <li key={String(b.id)}>
                  {String(b.name)} {b.isDefault ? "(default)" : ""}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </main>
    </div>
  );
}

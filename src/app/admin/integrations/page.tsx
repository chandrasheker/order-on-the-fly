"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plug, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { Button, Card, Input, Spinner, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";

type Connection = {
  platform: "SWIGGY" | "ZOMATO";
  outletId: string;
  status: string;
  autoConfirm: boolean;
  lastOrderAt: string | null;
  lastError: string | null;
  apiKeyMasked: string;
  webhookUrl: string;
  webhookSecret: string;
  webhookSecretMasked: string;
};

const STATUS_LABEL: Record<string, string> = {
  NOT_CONFIGURED: "Not configured",
  CREDENTIALS_SAVED: "Credentials saved — waiting for partner activation",
  WEBHOOK_PENDING: "Ready — register webhook with partner",
  CONNECTED: "Live — receiving orders automatically",
  ERROR: "Error — check credentials",
};

export default function IntegrationsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { outletId: string; apiKey: string; apiSecret: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/integrations/aggregators");
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = await res.json();
    const list = data.connections as Connection[];
    setConnections(list);
    setDrafts(
      Object.fromEntries(
        list.map((c) => [
          c.platform,
          { outletId: c.outletId, apiKey: "", apiSecret: "" },
        ])
      )
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (platform: Connection["platform"]) => {
    const draft = drafts[platform];
    setSaving(platform);
    setMessage(null);
    const res = await fetch("/api/integrations/aggregators", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform,
        outletId: draft.outletId,
        apiKey: draft.apiKey || undefined,
        apiSecret: draft.apiSecret || undefined,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setMessage({ type: "ok", text: json.message });
      await load();
    } else {
      setMessage({ type: "err", text: json.error || "Save failed" });
    }
    setSaving(null);
  };

  const test = async (platform: Connection["platform"]) => {
    setTesting(platform);
    setMessage(null);
    const res = await fetch("/api/integrations/aggregators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform }),
    });
    const json = await res.json();
    setMessage({ type: json.ok ? "ok" : "err", text: json.message });
    await load();
    setTesting(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a12] flex items-center justify-center">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a12] text-white">
      <header className="border-b border-white/5 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href="/staff/dashboard" className="p-2 rounded-xl bg-white/5 hover:bg-white/10">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2">
            <Plug className="w-5 h-5 text-orange-400" />
            <div>
              <h1 className="text-xl font-bold">Swiggy & Zomato</h1>
              <p className="text-sm text-zinc-400">Enter credentials once — orders sync automatically</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <Card className="p-5 space-y-3 border-orange-500/20 bg-orange-500/5">
          <h2 className="font-semibold text-orange-200">How automatic sync works</h2>
          <ol className="text-sm text-zinc-400 space-y-2 list-decimal list-inside">
            <li>Get outlet ID + API key from Swiggy/Zomato partner dashboard (after POS integration approval).</li>
            <li>Save credentials below — TableTap generates your webhook URL + secret.</li>
            <li>Share webhook URL with Zomato/Swiggy partner team (one-time setup per outlet).</li>
            <li>Orders appear on kitchen board automatically — no manual entry.</li>
          </ol>
          <p className="text-xs text-zinc-500">
            Zomato POS docs:{" "}
            <a
              href="https://www.zomato.com/developer/integration/"
              target="_blank"
              rel="noreferrer"
              className="text-orange-300 underline"
            >
              zomato.com/developer/integration
            </a>
            . Swiggy requires partner team onboarding for API access.
          </p>
        </Card>

        {message && (
          <p className={cn("text-sm text-center", message.type === "ok" ? "text-emerald-400" : "text-red-400")}>
            {message.text}
          </p>
        )}

        {connections.map((conn) => {
          const draft = drafts[conn.platform] ?? { outletId: "", apiKey: "", apiSecret: "" };
          const live = conn.status === "CONNECTED";
          return (
            <Card key={conn.platform} className="p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{conn.platform === "SWIGGY" ? "Swiggy" : "Zomato"}</h2>
                  <Badge
                    className={cn(
                      live
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                        : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                    )}
                  >
                    {STATUS_LABEL[conn.status] ?? conn.status}
                  </Badge>
                </div>
                {live ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-amber-400" />
                )}
              </div>

              {conn.lastOrderAt && (
                <p className="text-xs text-zinc-500">
                  Last automatic order: {new Date(conn.lastOrderAt).toLocaleString()}
                </p>
              )}
              {conn.lastError && (
                <p className="text-xs text-red-400">{conn.lastError}</p>
              )}

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Outlet / Restaurant ID</label>
                  <Input
                    value={draft.outletId}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [conn.platform]: { ...prev[conn.platform], outletId: e.target.value },
                      }))
                    }
                    placeholder="From partner dashboard"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">
                    API key {conn.apiKeyMasked && `(saved ${conn.apiKeyMasked})`}
                  </label>
                  <Input
                    type="password"
                    value={draft.apiKey}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [conn.platform]: { ...prev[conn.platform], apiKey: e.target.value },
                      }))
                    }
                    placeholder="Leave blank to keep current"
                    autoComplete="off"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-zinc-500 block mb-1">API secret (if provided by partner)</label>
                  <Input
                    type="password"
                    value={draft.apiSecret}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [conn.platform]: { ...prev[conn.platform], apiSecret: e.target.value },
                      }))
                    }
                    placeholder="Optional"
                    autoComplete="off"
                  />
                </div>
              </div>

              {conn.webhookUrl && (
                <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2 text-xs">
                  <p className="text-zinc-500">Give this to {conn.platform === "SWIGGY" ? "Swiggy" : "Zomato"} partner team:</p>
                  <p>
                    <span className="text-zinc-500">Webhook URL:</span>{" "}
                    <code className="text-emerald-300 break-all">{conn.webhookUrl}</code>
                  </p>
                  <p>
                    <span className="text-zinc-500">Webhook secret:</span>{" "}
                    <code className="text-emerald-300">{conn.webhookSecret || conn.webhookSecretMasked}</code>
                  </p>
                  <p className="text-zinc-600">Authorization header: Bearer &lt;webhook secret&gt;</p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void save(conn.platform)} disabled={saving === conn.platform}>
                  {saving === conn.platform ? <Spinner /> : "Save credentials"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void test(conn.platform)}
                  disabled={testing === conn.platform}
                >
                  {testing === conn.platform ? <Spinner /> : <RefreshCw className="w-4 h-4" />}
                  Test readiness
                </Button>
              </div>
            </Card>
          );
        })}
      </main>
    </div>
  );
}

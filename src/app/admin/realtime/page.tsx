"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Radio } from "lucide-react";
import { Button, Card, Spinner, Input } from "@/components/ui";

type Tab = "promotions" | "combos" | "modifiers" | "kitchen" | "gateway" | "alerts";

export default function RealtimeAdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("promotions");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [promotions, setPromotions] = useState<Array<Record<string, unknown>>>([]);
  const [combos, setCombos] = useState<Array<Record<string, unknown>>>([]);
  const [modifierGroups, setModifierGroups] = useState<Array<Record<string, unknown>>>([]);
  const [menuItems, setMenuItems] = useState<Array<{ id: string; name: string; category: { name: string } }>>([]);
  const [kitchen, setKitchen] = useState<Record<string, unknown> | null>(null);
  const [gateway, setGateway] = useState<Record<string, unknown> | null>(null);
  const [alertSettings, setAlertSettings] = useState<Record<string, unknown> | null>(null);

  const [promoForm, setPromoForm] = useState({
    name: "",
    type: "PERCENT",
    value: 10,
    code: "",
    minOrderAmount: 0,
    isActive: true,
  });
  const [comboForm, setComboForm] = useState({
    name: "",
    comboPrice: 0,
    menuItemIds: [] as string[],
  });
  const [modForm, setModForm] = useState({
    name: "",
    required: false,
    maxSelect: 1,
    optionName: "",
    optionPrice: 0,
    menuItemIds: [] as string[],
  });
  const [gatewayForm, setGatewayForm] = useState({
    provider: "RAZORPAY",
    keyId: "",
    secret: "",
    webhookSecret: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [promoRes, comboRes, modRes, menuRes, kitchenRes, gwRes, alertRes] = await Promise.all([
        fetch("/api/realtime/promotions"),
        fetch("/api/realtime/combos"),
        fetch("/api/realtime/modifiers"),
        fetch("/api/menu/manage"),
        fetch("/api/realtime/kitchen"),
        fetch("/api/realtime/gateway"),
        fetch("/api/realtime/alerts-settings"),
      ]);

      if (promoRes.status === 403) {
        router.push("/staff/dashboard");
        return;
      }

      if (promoRes.ok) setPromotions((await promoRes.json()).promotions ?? []);
      if (comboRes.ok) setCombos((await comboRes.json()).combos ?? []);
      if (modRes.ok) setModifierGroups((await modRes.json()).groups ?? []);
      if (menuRes.ok) {
        const menuJson = await menuRes.json();
        const flat = (menuJson.categories ?? []).flatMap(
          (c: { name: string; items: Array<{ id: string; name: string }> }) =>
            c.items.map((i) => ({ ...i, category: { name: c.name } })),
        );
        setMenuItems(flat);
      }
      if (kitchenRes.ok) setKitchen((await kitchenRes.json()).state ?? null);
      if (gwRes.ok) setGateway((await gwRes.json()).settings ?? null);
      if (alertRes.ok) setAlertSettings((await alertRes.json()).settings ?? null);
    } catch {
      /* ignore network errors */
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const savePromo = async () => {
    const res = await fetch("/api/realtime/promotions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(promoForm),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage({ type: "err", text: json.error ?? "Save failed" });
      return;
    }
    setMessage({ type: "ok", text: "Promotion saved" });
    setPromoForm({ name: "", type: "PERCENT", value: 10, code: "", minOrderAmount: 0, isActive: true });
    void load();
  };

  const saveCombo = async () => {
    const res = await fetch("/api/realtime/combos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: comboForm.name,
        comboPrice: comboForm.comboPrice,
        items: comboForm.menuItemIds.map((id) => ({ menuItemId: id, quantity: 1 })),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage({ type: "err", text: json.error ?? "Save failed" });
      return;
    }
    setMessage({ type: "ok", text: "Combo saved" });
    setComboForm({ name: "", comboPrice: 0, menuItemIds: [] });
    void load();
  };

  const saveModifier = async () => {
    const res = await fetch("/api/realtime/modifiers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: modForm.name,
        required: modForm.required,
        maxSelect: modForm.maxSelect,
        options: [{ name: modForm.optionName || "Regular", priceDelta: modForm.optionPrice }],
        menuItemIds: modForm.menuItemIds,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage({ type: "err", text: json.error ?? "Save failed" });
      return;
    }
    setMessage({ type: "ok", text: "Modifier group saved" });
    setModForm({
      name: "",
      required: false,
      maxSelect: 1,
      optionName: "",
      optionPrice: 0,
      menuItemIds: [],
    });
    void load();
  };

  const saveKitchen = async (paused: boolean) => {
    await fetch("/api/realtime/kitchen", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paused,
        message: (document.getElementById("kitchen-msg") as HTMLInputElement)?.value ?? null,
        autoPauseOverdueThreshold: Number(
          (document.getElementById("kitchen-threshold") as HTMLInputElement)?.value ?? 0,
        ),
      }),
    });
    setMessage({ type: "ok", text: paused ? "Kitchen paused" : "Kitchen resumed" });
    void load();
  };

  const saveGateway = async () => {
    const res = await fetch("/api/realtime/gateway", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gatewayForm),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage({ type: "err", text: json.error ?? "Save failed" });
      return;
    }
    setMessage({ type: "ok", text: "Payment gateway saved" });
    void load();
  };

  const saveAlerts = async (patch: Record<string, boolean>) => {
    await fetch("/api/realtime/alerts-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setMessage({ type: "ok", text: "Alert settings saved" });
    void load();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "promotions", label: "Promotions" },
    { id: "combos", label: "Combos" },
    { id: "modifiers", label: "Modifiers" },
    { id: "kitchen", label: "Kitchen" },
    { id: "gateway", label: "Payments" },
    { id: "alerts", label: "Push / SMS" },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-white/10 px-4 py-4 max-w-4xl mx-auto flex items-center gap-3">
        <Link href="/staff/dashboard" className="p-2 rounded-xl bg-white/5 hover:bg-white/10">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <Radio className="w-5 h-5 text-sky-400" />
        <h1 className="text-lg font-bold">Real-time ops</h1>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {message && (
          <p className={message.type === "ok" ? "text-emerald-400 text-sm" : "text-red-400 text-sm"}>
            {message.text}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-full text-sm ${
                tab === t.id ? "bg-sky-500 text-white" : "bg-white/5 text-zinc-400"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "promotions" && (
          <Card className="p-4 space-y-4">
            <h2 className="font-semibold">Promotions</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <Input placeholder="Name" value={promoForm.name} onChange={(e) => setPromoForm({ ...promoForm, name: e.target.value })} />
              <Input placeholder="Code (optional)" value={promoForm.code} onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value })} />
              <select
                className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm"
                value={promoForm.type}
                onChange={(e) => setPromoForm({ ...promoForm, type: e.target.value })}
              >
                <option value="PERCENT">Percent off order</option>
                <option value="FIXED">Fixed amount off</option>
                <option value="CATEGORY_PERCENT">Category percent</option>
                <option value="BOGO">BOGO (buy 2 get 1)</option>
              </select>
              <Input type="number" placeholder="Value" value={promoForm.value} onChange={(e) => setPromoForm({ ...promoForm, value: Number(e.target.value) })} />
            </div>
            <Button onClick={() => void savePromo()} className="gap-1">
              <Plus className="w-4 h-4" /> Add promotion
            </Button>
            <ul className="space-y-2">
              {promotions.map((p) => (
                <li key={String(p.id)} className="flex justify-between items-center p-3 rounded-xl bg-white/5 text-sm">
                  <span>{String(p.name)} — {String(p.type)} {String(p.value)}{p.code ? ` · ${String(p.code)}` : ""}</span>
                  <button
                    type="button"
                    className="text-red-400"
                    onClick={async () => {
                      await fetch(`/api/realtime/promotions?id=${p.id}`, { method: "DELETE" });
                      void load();
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {tab === "combos" && (
          <Card className="p-4 space-y-4">
            <h2 className="font-semibold">Combo meals</h2>
            <Input placeholder="Combo name" value={comboForm.name} onChange={(e) => setComboForm({ ...comboForm, name: e.target.value })} />
            <Input type="number" placeholder="Combo price" value={comboForm.comboPrice || ""} onChange={(e) => setComboForm({ ...comboForm, comboPrice: Number(e.target.value) })} />
            <div className="max-h-40 overflow-y-auto space-y-1 text-sm">
              {menuItems.map((item) => (
                <label key={item.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={comboForm.menuItemIds.includes(item.id)}
                    onChange={(e) => {
                      setComboForm((f) => ({
                        ...f,
                        menuItemIds: e.target.checked
                          ? [...f.menuItemIds, item.id]
                          : f.menuItemIds.filter((id) => id !== item.id),
                      }));
                    }}
                  />
                  {item.name}
                </label>
              ))}
            </div>
            <Button onClick={() => void saveCombo()}>Save combo</Button>
            <ul className="space-y-2">
              {combos.map((c) => (
                <li key={String(c.id)} className="p-3 rounded-xl bg-white/5 text-sm flex justify-between">
                  <span>{String(c.name)} — ₹{String(c.comboPrice)}</span>
                  <button type="button" className="text-red-400" onClick={async () => {
                    await fetch(`/api/realtime/combos?id=${c.id}`, { method: "DELETE" });
                    void load();
                  }}><Trash2 className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {tab === "modifiers" && (
          <Card className="p-4 space-y-4">
            <h2 className="font-semibold">Modifier groups</h2>
            <Input placeholder="Group name (e.g. Size)" value={modForm.name} onChange={(e) => setModForm({ ...modForm, name: e.target.value })} />
            <Input placeholder="Option name" value={modForm.optionName} onChange={(e) => setModForm({ ...modForm, optionName: e.target.value })} />
            <Input type="number" placeholder="Price delta" value={modForm.optionPrice || ""} onChange={(e) => setModForm({ ...modForm, optionPrice: Number(e.target.value) })} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={modForm.required} onChange={(e) => setModForm({ ...modForm, required: e.target.checked })} />
              Required
            </label>
            <div className="max-h-40 overflow-y-auto space-y-1 text-sm">
              {menuItems.map((item) => (
                <label key={item.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={modForm.menuItemIds.includes(item.id)}
                    onChange={(e) => {
                      setModForm((f) => ({
                        ...f,
                        menuItemIds: e.target.checked
                          ? [...f.menuItemIds, item.id]
                          : f.menuItemIds.filter((id) => id !== item.id),
                      }));
                    }}
                  />
                  {item.name}
                </label>
              ))}
            </div>
            <Button onClick={() => void saveModifier()}>Save modifier group</Button>
            <ul className="space-y-2">
              {modifierGroups.map((g) => (
                <li key={String(g.id)} className="p-3 rounded-xl bg-white/5 text-sm flex justify-between">
                  <span>{String(g.name)}</span>
                  <button type="button" className="text-red-400" onClick={async () => {
                    await fetch(`/api/realtime/modifiers?id=${g.id}`, { method: "DELETE" });
                    void load();
                  }}><Trash2 className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {tab === "kitchen" && (
          <Card className="p-4 space-y-4">
            <h2 className="font-semibold">Kitchen load control</h2>
            <p className="text-sm text-zinc-400">
              Status: {kitchen?.paused ? "Paused" : "Accepting orders"}
              {kitchen?.overdueCount != null && ` · ${String(kitchen.overdueCount)} overdue`}
            </p>
            <Input id="kitchen-msg" placeholder="Pause message for guests" defaultValue={String(kitchen?.message ?? "")} />
            <Input id="kitchen-threshold" type="number" placeholder="Auto-pause threshold" defaultValue={String(kitchen?.autoPauseThreshold ?? 0)} />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void saveKitchen(true)}>Pause QR orders</Button>
              <Button onClick={() => void saveKitchen(false)}>Resume</Button>
            </div>
          </Card>
        )}

        {tab === "gateway" && (
          <Card className="p-4 space-y-4">
            <h2 className="font-semibold">Payment webhooks</h2>
            {gateway?.webhookUrl ? (
              <p className="text-xs text-zinc-400 break-all">Webhook URL: {String(gateway.webhookUrl)}?provider=razorpay</p>
            ) : null}
            <select
              className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm"
              value={gatewayForm.provider}
              onChange={(e) => setGatewayForm({ ...gatewayForm, provider: e.target.value })}
            >
              <option value="RAZORPAY">Razorpay</option>
              <option value="PHONEPE">PhonePe</option>
              <option value="PAYTM">Paytm</option>
            </select>
            <Input placeholder="Key ID" value={gatewayForm.keyId} onChange={(e) => setGatewayForm({ ...gatewayForm, keyId: e.target.value })} />
            <Input placeholder="Secret (stored encrypted)" type="password" value={gatewayForm.secret} onChange={(e) => setGatewayForm({ ...gatewayForm, secret: e.target.value })} />
            <Input placeholder="Webhook secret" type="password" value={gatewayForm.webhookSecret} onChange={(e) => setGatewayForm({ ...gatewayForm, webhookSecret: e.target.value })} />
            <Button onClick={() => void saveGateway()}>Save gateway</Button>
          </Card>
        )}

        {tab === "alerts" && (
          <Card className="p-4 space-y-4">
            <h2 className="font-semibold">Push & SMS alerts</h2>
            <p className="text-sm text-zinc-400">
              Staff enable push from the dashboard. Configure VAPID keys and SMS_WEBHOOK_URL in .env.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(alertSettings?.pushAlertsEnabled)}
                onChange={(e) => void saveAlerts({ pushAlertsEnabled: e.target.checked })}
              />
              Web push alerts enabled
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(alertSettings?.smsAlertsEnabled)}
                onChange={(e) => void saveAlerts({ smsAlertsEnabled: e.target.checked })}
              />
              SMS alerts enabled
            </label>
          </Card>
        )}
      </main>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Package,
  Clock,
  CalendarDays,
  Coins,
  Users,
  Shield,
  Bell,
  Download,
} from "lucide-react";
import { Button, Card, Input, Spinner, Badge } from "@/components/ui";
import { cn, formatCurrency } from "@/lib/utils";

type Tab = "inventory" | "labor" | "reservations" | "tips" | "guests" | "audit";

const TABS: { id: Tab; label: string; icon: typeof Package; flag: string }[] = [
  { id: "inventory", label: "Inventory", icon: Package, flag: "inventory_86" },
  { id: "labor", label: "Labor & SPLH", icon: Clock, flag: "labor_clock" },
  { id: "reservations", label: "Reservations", icon: CalendarDays, flag: "reservations" },
  { id: "tips", label: "Tips & comps", icon: Coins, flag: "tip_pooling" },
  { id: "guests", label: "Guest CRM", icon: Users, flag: "guest_crm" },
  { id: "audit", label: "Audit log", icon: Shield, flag: "audit_log" },
];

export default function OperationsPage() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<Tab>("inventory");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const loadFlags = useCallback(async () => {
    const res = await fetch("/api/features");
    if (res.ok) {
      const data = await res.json();
      setEnabled(data.enabled ?? {});
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadFlags();
  }, [loadFlags]);

  if (loading) {
    return (
      <div className="min-h-screen bg-app-shell flex items-center justify-center">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  const activeFlag = TABS.find((t) => t.id === tab)?.flag;
  const tabEnabled = activeFlag ? enabled[activeFlag] : false;

  return (
    <div className="min-h-screen bg-app-shell text-foreground">
      <header className="border-b border-white/5 px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/staff/dashboard" className="p-2 rounded-xl bg-white/5 hover:bg-white/10">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Operations</h1>
            <p className="text-sm text-zinc-400">Inventory · labor · reservations · tips · CRM · audit</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl text-sm border transition-colors",
                tab === t.id
                  ? "bg-orange-500/20 border-orange-500/40 text-orange-200"
                  : "bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10",
                !enabled[t.flag] && "opacity-50"
              )}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
              {!enabled[t.flag] && (
                <Badge className="text-[10px] py-0">off</Badge>
              )}
            </button>
          ))}
        </div>

        {message && <p className="text-sm text-emerald-400 text-center">{message}</p>}

        {!tabEnabled ? (
          <Card className="p-8 text-center text-zinc-400">
            Enable <strong className="text-white">{activeFlag}</strong> from super admin → Premium features
            (or run <code className="text-orange-300">enable-premium-features.ts --all</code>).
          </Card>
        ) : (
          <>
            {tab === "inventory" && <InventoryPanel onMessage={setMessage} />}
            {tab === "labor" && <LaborPanel onMessage={setMessage} />}
            {tab === "reservations" && <ReservationsPanel onMessage={setMessage} />}
            {tab === "tips" && <TipsPanel onMessage={setMessage} />}
            {tab === "guests" && <GuestsPanel onMessage={setMessage} />}
            {tab === "audit" && <AuditPanel />}
          </>
        )}
      </main>
    </div>
  );
}

function InventoryPanel({ onMessage }: { onMessage: (m: string) => void }) {
  const [items, setItems] = useState<
    Array<{
      id: string;
      name: string;
      isAvailable: boolean;
      trackInventory: boolean;
      stockQuantity: number | null;
      lowStockThreshold: number;
      category: { name: string };
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/inventory");
    if (res.ok) {
      const data = await res.json();
      setItems(data.items);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (itemId: string, trackInventory: boolean, stockQuantity: number) => {
    const res = await fetch("/api/inventory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, trackInventory, stockQuantity }),
    });
    if (res.ok) {
      onMessage("Stock updated");
      await load();
    }
  };

  if (loading) return <Spinner />;

  return (
    <Card className="p-4 space-y-3">
      <p className="text-sm text-zinc-400">
        Track stock per item. When stock hits 0, item is auto-86&apos;d on menu and aggregators.
      </p>
      {items.map((item) => (
        <div key={item.id} className="flex flex-wrap items-center gap-3 py-2 border-b border-white/5">
          <div className="flex-1 min-w-[140px]">
            <p className="font-medium">{item.name}</p>
            <p className="text-xs text-zinc-500">{item.category.name}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={item.trackInventory}
              onChange={(e) => void save(item.id, e.target.checked, item.stockQuantity ?? 0)}
            />
            Track
          </label>
          <Input
            type="number"
            className="w-24"
            value={item.stockQuantity ?? 0}
            disabled={!item.trackInventory}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setItems((prev) =>
                prev.map((i) => (i.id === item.id ? { ...i, stockQuantity: v } : i))
              );
            }}
            onBlur={() =>
              item.trackInventory && void save(item.id, true, item.stockQuantity ?? 0)
            }
          />
          <Badge className={item.isAvailable ? "text-emerald-300" : "text-red-300"}>
            {item.isAvailable ? "Available" : "86'd"}
          </Badge>
        </div>
      ))}
    </Card>
  );
}

function LaborPanel({ onMessage }: { onMessage: (m: string) => void }) {
  const [data, setData] = useState<{
    totalHours: number;
    revenue: number;
    splh: number;
    shifts: Array<{ name: string; role: string; hours: number; open: boolean }>;
  } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/labor");
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const action = async (a: "clock-in" | "clock-out") => {
    await fetch("/api/labor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: a }),
    });
    onMessage(a === "clock-in" ? "Clocked in" : "Clocked out");
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button onClick={() => void action("clock-in")}>Clock in</Button>
        <Button variant="secondary" onClick={() => void action("clock-out")}>
          Clock out
        </Button>
      </div>
      {data && (
        <Card className="p-4 grid sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-zinc-500">Labor hours today</p>
            <p className="text-2xl font-bold">{data.totalHours}h</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Revenue today</p>
            <p className="text-2xl font-bold">{formatCurrency(data.revenue)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">SPLH</p>
            <p className="text-2xl font-bold text-orange-300">{formatCurrency(data.splh)}</p>
          </div>
        </Card>
      )}
      {data?.shifts.map((s, i) => (
        <Card key={i} className="p-3 flex justify-between text-sm">
          <span>
            {s.name} · {s.role}
          </span>
          <span>
            {s.hours}h {s.open && <Badge className="ml-2">On shift</Badge>}
          </span>
        </Card>
      ))}
    </div>
  );
}

function ReservationsPanel({ onMessage }: { onMessage: (m: string) => void }) {
  const [rows, setRows] = useState<
    Array<{ id: string; guestName: string; guestPhone: string; partySize: number; status: string }>
  >([]);
  const [form, setForm] = useState({ guestName: "", guestPhone: "", partySize: "2" });

  const load = useCallback(async () => {
    const res = await fetch("/api/reservations");
    if (res.ok) {
      const data = await res.json();
      setRows(data.reservations);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, partySize: parseInt(form.partySize, 10) }),
    });
    onMessage("Reservation added");
    setForm({ guestName: "", guestPhone: "", partySize: "2" });
    await load();
  };

  const notify = async (id: string) => {
    await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "notify", id }),
    });
    onMessage("Guest notified (SMS webhook or log)");
    await load();
  };

  const setStatus = async (id: string, status: string) => {
    await fetch("/api/reservations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    await load();
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 grid sm:grid-cols-4 gap-2">
        <Input placeholder="Guest name" value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.target.value })} />
        <Input placeholder="Phone" value={form.guestPhone} onChange={(e) => setForm({ ...form, guestPhone: e.target.value })} />
        <Input type="number" placeholder="Party" value={form.partySize} onChange={(e) => setForm({ ...form, partySize: e.target.value })} />
        <Button onClick={() => void create()}>Add to waitlist</Button>
      </Card>
      {rows.map((r) => (
        <Card key={r.id} className="p-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium">{r.guestName}</p>
            <p className="text-xs text-zinc-500">
              {r.guestPhone} · party {r.partySize} · {r.status}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => void notify(r.id)}>
              <Bell className="w-3 h-3" /> Notify ready
            </Button>
            <Button size="sm" onClick={() => void setStatus(r.id, "SEATED")}>
              Seated
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function TipsPanel({ onMessage }: { onMessage: (m: string) => void }) {
  const [pool, setPool] = useState<{ totalTips: number; splits: Array<{ name: string; amount: number }> } | null>(
    null
  );

  const load = useCallback(async () => {
    const res = await fetch("/api/tips");
    if (res.ok) {
      const data = await res.json();
      setPool(data.pool);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const exportPayroll = async () => {
    const res = await fetch("/api/tips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "export" }),
    });
    if (res.ok) {
      onMessage("Tip pool exported for payroll");
      await load();
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        Pass <code className="text-orange-300">tipAmount</code> when marking orders paid. Export splits for payroll.
      </p>
      <Button onClick={() => void exportPayroll()}>
        <Download className="w-4 h-4" /> Export tip pool (7 days)
      </Button>
      {pool && (
        <Card className="p-4">
          <p className="text-lg font-bold">Total tips: {formatCurrency(pool.totalTips)}</p>
          {pool.splits.map((s, i) => (
            <p key={i} className="text-sm text-zinc-400">
              {s.name}: {formatCurrency(s.amount)}
            </p>
          ))}
        </Card>
      )}
    </div>
  );
}

function GuestsPanel({ onMessage }: { onMessage: (m: string) => void }) {
  const [guests, setGuests] = useState<
    Array<{ id: string; phone: string; name: string | null; visitCount: number; totalSpend: number }>
  >([]);

  useEffect(() => {
    void fetch("/api/guests")
      .then((r) => r.json())
      .then((d) => setGuests(d.guests ?? []));
  }, []);

  return (
    <Card className="p-4 space-y-2">
      <p className="text-sm text-zinc-400 mb-3">Profiles auto-created when orders include a phone number.</p>
      {guests.length === 0 && <p className="text-zinc-500">No guests yet.</p>}
      {guests.map((g) => (
        <div key={g.id} className="flex justify-between py-2 border-b border-white/5 text-sm">
          <span>
            {g.name ?? "Guest"} · {g.phone}
          </span>
          <span className="text-zinc-400">
            {g.visitCount} visits · {formatCurrency(g.totalSpend)}
          </span>
        </div>
      ))}
    </Card>
  );
}

function AuditPanel() {
  const [logs, setLogs] = useState<
    Array<{ actionType: string; actorName: string | null; reason: string | null; createdAt: string }>
  >([]);

  useEffect(() => {
    void fetch("/api/audit")
      .then((r) => r.json())
      .then((d) => setLogs(d.logs ?? []));
  }, []);

  return (
    <Card className="p-4 space-y-2">
      <p className="text-sm text-zinc-400 mb-3">
        Server/cook rejections require manager password when audit log is enabled.
      </p>
      {logs.map((l, i) => (
        <div key={i} className="text-sm py-2 border-b border-white/5">
          <span className="text-orange-300">{l.actionType}</span> · {l.actorName ?? "—"} ·{" "}
          {new Date(l.createdAt).toLocaleString()}
          {l.reason && <span className="text-zinc-500"> — {l.reason}</span>}
        </div>
      ))}
    </Card>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  LayoutGrid,
  RefreshCw,
  User,
  Clock,
  CircleDollarSign,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Button, Badge, Spinner } from "@/components/ui";
import { cn, formatCurrency } from "@/lib/utils";

type FloorTable = {
  id: string;
  number: number;
  section: string | null;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  guestCount: number | null;
  seatedAt: string | null;
  elapsedMinutes: number | null;
  assignedServer: { id: string; name: string } | null;
  state: string;
  stats: {
    orderCount: number;
    activeItems: number;
    overdueItems: number;
    billTotal: number;
    paidTotal: number;
    remaining: number;
  };
};

type Server = { id: string; name: string };

const STATE_STYLES: Record<string, string> = {
  available: "border-zinc-600/40 bg-zinc-800/40 text-zinc-400",
  seated: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  ordering: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  kitchen: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  eating: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  payment: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
  overdue: "border-red-500/50 bg-red-500/15 text-red-300 animate-pulse",
};

export default function FloorPlanPage() {
  const [tables, setTables] = useState<FloorTable[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FloorTable | null>(null);
  const [role, setRole] = useState("SERVER");

  const loadFloor = useCallback(async () => {
    const floorRes = await fetch("/api/floor");
    if (floorRes.ok) {
      const data = await floorRes.json();
      setTables(data.tables ?? []);
      setServers(data.servers ?? []);
    }
  }, []);

  const load = useCallback(async () => {
    const meRes = await fetch("/api/auth/me");
    if (meRes.ok) {
      const me = await meRes.json();
      setRole(me.user?.role ?? "SERVER");
    }
    await loadFloor();
    setLoading(false);
  }, [loadFloor]);

  useEffect(() => {
    void load();
    const poll = setInterval(() => {
      if (document.hidden) return;
      void loadFloor();
    }, 8000);
    const onVisible = () => {
      if (!document.hidden) void loadFloor();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, loadFloor]);

  const patchTable = async (tableId: string, body: Record<string, unknown>) => {
    const res = await fetch("/api/floor", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tableId, ...body }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(json.error || "Could not update table");
    }
    load();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-app-shell flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const canvasWidth = Math.max(
    640,
    ...tables.map((t) => t.positionX + t.width + 32),
  );
  const canvasHeight = Math.max(
    480,
    ...tables.map((t) => t.positionY + t.height + 32),
  );

  return (
    <div className="min-h-screen bg-app-shell text-foreground">
      <header className="border-b border-white/10 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/staff/dashboard" className="p-2 rounded-xl bg-white/5 hover:bg-white/10">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="font-bold flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-violet-400" /> Floor plan
            </h1>
            <p className="text-xs text-zinc-500">Table timers · server assignment · live bill</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={load}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </header>

      <div className="flex flex-col lg:flex-row">
        <div className="flex-1 overflow-auto p-4">
          <div
            className="relative rounded-2xl border border-white/10 bg-[#111118] mx-auto"
            style={{ width: canvasWidth, height: canvasHeight, minWidth: "100%" }}
          >
            {tables.map((table) => (
              <motion.button
                key={table.id}
                type="button"
                layout
                onClick={() => setSelected(table)}
                className={cn(
                  "absolute rounded-2xl border-2 p-2 text-left transition-shadow hover:shadow-lg hover:shadow-black/30",
                  STATE_STYLES[table.state] ?? STATE_STYLES.available,
                  selected?.id === table.id && "ring-2 ring-white/40",
                )}
                style={{
                  left: table.positionX,
                  top: table.positionY,
                  width: table.width,
                  height: table.height,
                }}
              >
                <div className="font-black text-xl leading-none">T{table.number}</div>
                {table.elapsedMinutes !== null && (
                  <div className="text-[10px] flex items-center gap-0.5 mt-1 opacity-80">
                    <Clock className="w-3 h-3" />
                    {table.elapsedMinutes}m
                  </div>
                )}
                {table.assignedServer && (
                  <div className="text-[10px] truncate mt-0.5 opacity-80">{table.assignedServer.name}</div>
                )}
                {table.stats.remaining > 0 && (
                  <div className="text-[10px] mt-0.5 font-medium">
                    {formatCurrency(table.stats.remaining)}
                  </div>
                )}
              </motion.button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 mt-4 text-xs text-zinc-500">
            {Object.entries(STATE_STYLES).map(([state]) => (
              <span key={state} className="capitalize">
                {state.replace("_", " ")}
              </span>
            ))}
          </div>
        </div>

        {selected && (
          <aside className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-white/10 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Table {selected.number}</h2>
              <Badge className={STATE_STYLES[selected.state]}>{selected.state}</Badge>
            </div>

            {selected.elapsedMinutes !== null && (
              <p className="text-sm text-zinc-400 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Seated {selected.elapsedMinutes} minutes
              </p>
            )}

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-white/5 p-3">
                <p className="text-zinc-500 text-xs">Orders</p>
                <p className="font-bold">{selected.stats.orderCount}</p>
              </div>
              <div className="rounded-xl bg-white/5 p-3">
                <p className="text-zinc-500 text-xs">Kitchen items</p>
                <p className="font-bold">{selected.stats.activeItems}</p>
              </div>
              <div className="rounded-xl bg-white/5 p-3 col-span-2">
                <p className="text-zinc-500 text-xs flex items-center gap-1">
                  <CircleDollarSign className="w-3 h-3" /> Bill
                </p>
                <p className="font-bold text-yellow-400">{formatCurrency(selected.stats.remaining)}</p>
                {selected.stats.paidTotal > 0 && (
                  <p className="text-xs text-emerald-400">
                    {formatCurrency(selected.stats.paidTotal)} paid
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs text-zinc-500 flex items-center gap-1 mb-1">
                <User className="w-3 h-3" /> Assigned server
              </label>
              <select
                className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm"
                value={selected.assignedServer?.id ?? ""}
                onChange={(e) =>
                  patchTable(selected.id, {
                    assignedServerId: e.target.value || null,
                  })
                }
              >
                <option value="">Unassigned</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-zinc-500 flex items-center gap-1 mb-1">
                <Users className="w-3 h-3" /> Guests
              </label>
              <input
                type="number"
                min={1}
                max={20}
                className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm"
                value={selected.guestCount ?? ""}
                placeholder="Guest count"
                onChange={(e) => {
                  const raw = e.target.value;
                  if (!raw) {
                    patchTable(selected.id, { guestCount: null });
                    return;
                  }
                  const count = parseInt(raw, 10);
                  if (Number.isNaN(count)) return;
                  patchTable(selected.id, { guestCount: count });
                }}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => patchTable(selected.id, { seated: true })}
              >
                Seat / open table
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  patchTable(selected.id, { clear: true });
                  setSelected(null);
                }}
              >
                Clear table
              </Button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

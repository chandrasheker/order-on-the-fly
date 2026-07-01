"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { swallowPollingFetchError } from "@/lib/client-fetch";
import { DoorOpen, DoorClosed, ChevronDown, ChevronUp } from "lucide-react";

type TableRow = {
  id: string;
  number: number;
  orderingEnabled: boolean;
  activeSessions: number;
};

export function TableOrderingPanel() {
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/tables/manage");
      if (res.ok) {
        const json = await res.json();
        setTables(json.tables ?? []);
      }
    } catch {
      /* ignore transient network errors during dev reload or polling */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  const toggle = async (table: TableRow) => {
    setBusyId(table.id);
    try {
      await fetch("/api/tables/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId: table.id, orderingEnabled: !table.orderingEnabled }),
      });
      await load();
    } catch (error) {
      swallowPollingFetchError(error);
    } finally {
      setBusyId(null);
    }
  };

  const openCount = tables.filter((table) => table.orderingEnabled).length;

  if (loading) {
    return (
      <div className="h-full p-4 rounded-2xl border border-white/10 bg-white/5 flex justify-center items-center min-h-[7rem]">
        <Spinner className="w-5 h-5" />
      </div>
    );
  }

  return (
    <div className="h-full p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="font-semibold text-emerald-300">Table ordering</p>
          <p className="text-xs text-zinc-400 mt-1">
            {openCount} of {tables.length} table{tables.length === 1 ? "" : "s"} open for QR ordering
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 shrink-0"
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>
      {expanded && (
        <>
          <p className="text-xs text-zinc-500 mb-3">
            Open a table when guests are seated so they can scan the QR and order. Close it when
            they leave to block remote misuse of saved links.
          </p>
          <div className="flex flex-wrap gap-2">
            {tables.map((table) => (
              <button
                key={table.id}
                type="button"
                disabled={busyId === table.id}
                onClick={() => void toggle(table)}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors disabled:opacity-50",
                  table.orderingEnabled
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-200"
                    : "bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10",
                )}
              >
                {table.orderingEnabled ? (
                  <DoorOpen className="w-4 h-4" />
                ) : (
                  <DoorClosed className="w-4 h-4" />
                )}
                T{table.number}
                {table.orderingEnabled && table.activeSessions > 0 && (
                  <span className="text-xs opacity-80">({table.activeSessions} online)</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

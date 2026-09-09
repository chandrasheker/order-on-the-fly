"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { swallowPollingFetchError } from "@/lib/client-fetch";
import { isDineInTable } from "@/lib/order-channel";
import { DoorOpen, DoorClosed, ChevronDown, ChevronUp } from "lucide-react";

type TableRow = {
  id: string;
  number: number;
  kind?: string;
  orderingEnabled: boolean;
  activeSessions: number;
};

export function TableOrderingPanel({ compact = false }: { compact?: boolean }) {
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/tables/manage");
      if (res.ok) {
        const json = await res.json();
        setTables(
          (json.tables ?? []).filter((table: TableRow) => isDineInTable(table)),
        );
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
      <div className={cn(
        "rounded-2xl border border-white/10 bg-white/5 flex justify-center items-center",
        compact ? "p-3 min-h-[4rem]" : "h-full p-4 min-h-[7rem]",
      )}>
        <Spinner className="w-5 h-5" />
      </div>
    );
  }

  return (
    <div className={cn(
      "rounded-2xl border border-emerald-500/20 bg-emerald-500/5",
      compact ? "p-3" : "h-full p-4",
    )}>
      <div className={cn("flex items-start justify-between gap-3", compact ? "mb-2" : "mb-3")}>
        <div className="min-w-0">
          <p className={cn("font-semibold text-emerald-800 dark:text-emerald-300", compact && "text-sm")}>Table ordering</p>
          <p className="text-xs text-muted mt-1">
            {openCount} of {tables.length} table{tables.length === 1 ? "" : "s"} open
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
          {!compact && (
          <p className="text-xs text-muted mb-3">
            Tables stay open for QR orders when empty. Disable a table only if you need to block
            it; it stays closed until you enable it again.
          </p>
          )}
          <div className={cn(compact ? "grid grid-cols-2 gap-2" : "flex flex-wrap gap-2")}>
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

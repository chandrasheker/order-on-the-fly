"use client";

import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { swallowPollingFetchError } from "@/lib/client-fetch";
import { isDineInTable } from "@/lib/order-channel";
import { DoorClosed, ChevronDown, ChevronUp } from "lucide-react";
import { useFloorTableStates } from "@/hooks/useFloorTableStates";
import { FLOOR_STATE_LABELS, FLOOR_STATE_STYLES, TABLE_CLOSED_STYLE } from "@/lib/floor-state-styles";

type TableRow = {
  id: string;
  number: number;
  kind?: string;
  orderingEnabled: boolean;
  activeSessions: number;
};

function chipStyle(table: TableRow, floorState?: string) {
  if (!table.orderingEnabled && (!floorState || floorState === "available")) {
    return TABLE_CLOSED_STYLE;
  }
  return FLOOR_STATE_STYLES[floorState ?? "available"] ?? FLOOR_STATE_STYLES.available;
}

function chipLabel(table: TableRow, floorState?: string) {
  if (!table.orderingEnabled && (!floorState || floorState === "available")) {
    return "Closed";
  }
  const key = (floorState ?? "available") as keyof typeof FLOOR_STATE_LABELS;
  return FLOOR_STATE_LABELS[key]?.label ?? "Available";
}

export function TableOrderingPanel({ compact = false }: { compact?: boolean }) {
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const { states } = useFloorTableStates();

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
      "rounded-2xl border border-white/10 bg-white/5",
      compact ? "p-3" : "h-full p-4",
    )}>
      <div className={cn("flex items-start justify-between gap-3", compact ? "mb-2" : "mb-3")}>
        <div className="min-w-0">
          <p className={cn("font-semibold text-foreground", compact && "text-sm")}>Table ordering</p>
          <p className="text-xs text-muted mt-1">
            {openCount} of {tables.length} table{tables.length === 1 ? "" : "s"} open
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-white/10 bg-white/5 text-muted hover:bg-white/10 hover:text-foreground shrink-0"
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
            Colors match the floor. Tap a table to open or close QR ordering.
          </p>
          )}
          <div className={cn(compact ? "grid grid-cols-2 gap-2" : "flex flex-wrap gap-2")}>
            {tables.map((table) => {
              const floorState = states[table.id]?.state;
              const label = chipLabel(table, floorState);
              return (
                <button
                  key={table.id}
                  type="button"
                  disabled={busyId === table.id}
                  onClick={() => void toggle(table)}
                  className={cn(
                    "inline-flex flex-col items-start gap-0.5 px-3 py-2 rounded-xl text-sm font-medium border transition-colors disabled:opacity-50 min-h-[3.25rem]",
                    chipStyle(table, floorState),
                  )}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {!table.orderingEnabled && (!floorState || floorState === "available") ? (
                      <DoorClosed className="w-3.5 h-3.5" />
                    ) : null}
                    T{table.number}
                    {table.orderingEnabled && table.activeSessions > 0 && (
                      <span className="text-[10px] opacity-80">({table.activeSessions})</span>
                    )}
                  </span>
                  <span className="text-[10px] font-normal opacity-80">{label}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(FLOOR_STATE_LABELS).map(([state, meta]) => (
              <span
                key={state}
                className={cn("px-1.5 py-0.5 rounded border text-[10px]", FLOOR_STATE_STYLES[state])}
              >
                {meta.label}
              </span>
            ))}
            <span className={cn("px-1.5 py-0.5 rounded border text-[10px]", TABLE_CLOSED_STYLE)}>
              Closed
            </span>
          </div>
        </>
      )}
    </div>
  );
}

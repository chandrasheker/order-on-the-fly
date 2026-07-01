"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { Badge, Button, Card, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  TableOrderList,
  type TableHistoryOrder,
} from "@/components/staff/table-order-history-shared";

type TableWithOrders = {
  id: string;
  number: number;
  orders: TableHistoryOrder[];
};

export function TableOrdersTodayPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [tables, setTables] = useState<TableWithOrders[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTableIds, setExpandedTableIds] = useState<Set<string>>(new Set());
  const [showEmpty, setShowEmpty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/orders/staff?byTable=1");
      if (res.ok) {
        const json = await res.json();
        setTables(json.tables ?? []);
      }
    } catch {
      /* ignore transient network errors */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 30_000);
    return () => clearInterval(interval);
  }, [load, refreshKey]);

  const visibleTables = useMemo(
    () => (showEmpty ? tables : tables.filter((table) => table.orders.length > 0)),
    [showEmpty, tables],
  );

  const tablesWithOrders = tables.filter((table) => table.orders.length > 0).length;
  const totalOrders = tables.reduce((sum, table) => sum + table.orders.length, 0);

  const toggleTable = (tableId: string) => {
    setExpandedTableIds((prev) => {
      const next = new Set(prev);
      if (next.has(tableId)) next.delete(tableId);
      else next.add(tableId);
      return next;
    });
  };

  const expandAll = () => setExpandedTableIds(new Set(visibleTables.map((table) => table.id)));
  const collapseAll = () => setExpandedTableIds(new Set());

  if (loading) {
    return (
      <Card className="p-12 flex justify-center">
        <Spinner className="w-8 h-8" />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-zinc-400">
          Today&apos;s dine-in orders by table — {tablesWithOrders} table
          {tablesWithOrders === 1 ? "" : "s"} with orders · {totalOrders} order
          {totalOrders === 1 ? "" : "s"} total
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => void load()}>
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={expandAll}>
            Expand all
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={collapseAll}>
            Collapse all
          </Button>
          <button
            type="button"
            onClick={() => setShowEmpty((value) => !value)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
              showEmpty
                ? "bg-white/10 border-white/20 text-white"
                : "bg-white/5 border-white/10 text-zinc-400 hover:text-white",
            )}
          >
            {showEmpty ? "Hide empty tables" : "Show empty tables"}
          </button>
        </div>
      </div>

      {visibleTables.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-zinc-400">No table orders yet today.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleTables.map((table) => {
            const expanded = expandedTableIds.has(table.id);
            return (
              <div
                key={table.id}
                className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleTable(table.id)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">Table {table.number}</span>
                    <Badge className="bg-white/10 text-zinc-300 border-white/10">
                      {table.orders.length} order{table.orders.length === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  {expanded ? (
                    <ChevronUp className="w-4 h-4 text-zinc-500 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
                  )}
                </button>
                {expanded && (
                  <div className="px-4 pb-4 border-t border-white/5">
                    <TableOrderList orders={table.orders} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

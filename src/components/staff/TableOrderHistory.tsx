"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, History } from "lucide-react";
import { Badge, Spinner } from "@/components/ui";
import {
  TableOrderList,
  type TableHistoryOrder,
} from "@/components/staff/table-order-history-shared";
import { swallowPollingFetchError } from "@/lib/client-fetch";

type TableOrderHistoryProps = {
  tableId: string;
  refreshKey?: number;
};

export function TableOrderHistory({ tableId, refreshKey = 0 }: TableOrderHistoryProps) {
  const [orders, setOrders] = useState<TableHistoryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/staff?tableId=${encodeURIComponent(tableId)}`);
      if (res.ok) {
        const json = await res.json();
        setOrders(json.orders ?? []);
      }
    } catch (error) {
      swallowPollingFetchError(error);
    } finally {
      setLoading(false);
    }
  }, [tableId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5"
      >
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-zinc-400" />
          <span className="font-medium text-white">Today&apos;s orders for this table</span>
          <Badge className="bg-white/10 text-zinc-300 border-white/10">{orders.length}</Badge>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-zinc-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-zinc-500" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-white/5">
          {loading ? (
            <div className="py-6 flex justify-center">
              <Spinner className="w-5 h-5" />
            </div>
          ) : (
            <TableOrderList orders={orders} />
          )}
        </div>
      )}
    </div>
  );
}

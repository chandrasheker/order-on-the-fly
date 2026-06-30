"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, History } from "lucide-react";
import { Badge, Spinner } from "@/components/ui";
import { cn, formatCurrency, orderItemLineTotal } from "@/lib/utils";

type HistoryItem = {
  id: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  status: string;
  notes: string | null;
};

type HistoryOrder = {
  id: string;
  orderNumber: number;
  customerName: string | null;
  status: string;
  paidAt: string | null;
  createdAt: string;
  total: number;
  items: HistoryItem[];
};

type TableOrderHistoryProps = {
  tableId: string;
  refreshKey?: number;
};

function statusLabel(status: string, paidAt: string | null) {
  if (paidAt) return "Paid";
  if (status === "SERVED") return "Awaiting payment";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function TableOrderHistory({ tableId, refreshKey = 0 }: TableOrderHistoryProps) {
  const [orders, setOrders] = useState<HistoryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/staff?tableId=${encodeURIComponent(tableId)}`);
      if (res.ok) {
        const json = await res.json();
        setOrders(json.orders ?? []);
      }
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
        <div className="px-4 pb-4 space-y-2 border-t border-white/5">
          {loading ? (
            <div className="py-6 flex justify-center">
              <Spinner className="w-5 h-5" />
            </div>
          ) : orders.length === 0 ? (
            <p className="text-sm text-zinc-500 py-4">No orders yet today for this table.</p>
          ) : (
            orders.map((order) => {
              const isOpen = openOrderId === order.id;
              return (
                <div key={order.id} className="rounded-xl border border-white/10 bg-black/20">
                  <button
                    type="button"
                    onClick={() => setOpenOrderId(isOpen ? null : order.id)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-3 text-left"
                  >
                    <div>
                      <p className="font-medium text-white">
                        Order #{order.orderNumber}
                        {order.customerName ? ` · ${order.customerName}` : ""}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {new Date(order.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        · {formatCurrency(order.total)}
                      </p>
                    </div>
                    <Badge
                      className={cn(
                        order.paidAt
                          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                          : order.status === "SERVED"
                            ? "bg-yellow-500/15 text-yellow-300 border-yellow-500/30"
                            : "bg-orange-500/15 text-orange-300 border-orange-500/30",
                      )}
                    >
                      {statusLabel(order.status, order.paidAt)}
                    </Badge>
                  </button>

                  {isOpen && (
                    <div className="px-3 pb-3 space-y-1 border-t border-white/5 pt-2">
                      {order.items.map((item) => (
                        <div key={item.id} className="text-sm">
                          <div className="flex justify-between gap-2 text-zinc-300">
                            <span>
                              {item.quantity}x {item.itemName}
                            </span>
                            <span className="text-zinc-500">
                              {formatCurrency(
                                orderItemLineTotal({
                                  unitPrice: item.unitPrice,
                                  quantity: item.quantity,
                                  status: item.status,
                                }),
                              )}
                            </span>
                          </div>
                          {item.notes && (
                            <p className="text-xs text-violet-300/90 pl-1">Note: {item.notes}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

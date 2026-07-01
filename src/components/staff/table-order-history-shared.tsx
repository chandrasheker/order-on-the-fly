"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";
import { cn, formatCurrency, orderItemLineTotal } from "@/lib/utils";

export type TableHistoryItem = {
  id: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  status: string;
  notes: string | null;
};

export type TableHistoryOrder = {
  id: string;
  orderNumber: number;
  customerName: string | null;
  status: string;
  paidAt: string | null;
  createdAt: string;
  total: number;
  items: TableHistoryItem[];
};

export function orderStatusLabel(status: string, paidAt: string | null) {
  if (paidAt) return "Paid";
  if (status === "SERVED") return "Awaiting payment";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function TableOrderList({
  orders,
  emptyMessage = "No orders yet today for this table.",
}: {
  orders: TableHistoryOrder[];
  emptyMessage?: string;
}) {
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  if (orders.length === 0) {
    return <p className="text-sm text-zinc-500 py-4">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-2">
      {orders.map((order) => {
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
                {orderStatusLabel(order.status, order.paidAt)}
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
      })}
    </div>
  );
}

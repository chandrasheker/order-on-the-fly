"use client";

import { useEffect, useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { isOrderFullyOutOfStock, orderUnavailableItems } from "@/lib/utils";

const DISMISS_KEY = "tabletap-oos-dismissed";

type OrderItem = {
  id: string;
  itemName: string;
  quantity: number;
  status: string;
};

type Order = {
  id: string;
  orderNumber: number;
  items: OrderItem[];
};

function readDismissedIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function persistDismissedIds(ids: string[]) {
  sessionStorage.setItem(DISMISS_KEY, JSON.stringify(ids));
}

export function dismissOutOfStockNotice(orderId: string) {
  const next = [...new Set([...readDismissedIds(), orderId])];
  persistDismissedIds(next);
}

type Props = {
  orders: Order[];
  cartItemCount: number;
  refreshTick: number;
  onDismiss: () => void;
};

export function OutOfStockNotice({ orders, cartItemCount, refreshTick, onDismiss }: Props) {
  const fullyOutOfStockOrders = useMemo(
    () => orders.filter((order) => isOrderFullyOutOfStock(order.items)),
    [orders],
  );

  const visibleOrders = useMemo(() => {
    void refreshTick;
    const dismissed = new Set(readDismissedIds());
    return fullyOutOfStockOrders.filter((order) => !dismissed.has(order.id));
  }, [fullyOutOfStockOrders, refreshTick]);

  useEffect(() => {
    if (cartItemCount <= 0 || fullyOutOfStockOrders.length === 0) return;
    const dismissed = new Set(readDismissedIds());
    let changed = false;
    for (const order of fullyOutOfStockOrders) {
      if (!dismissed.has(order.id)) {
        dismissed.add(order.id);
        changed = true;
      }
    }
    if (changed) {
      persistDismissedIds([...dismissed]);
      onDismiss();
    }
  }, [cartItemCount, fullyOutOfStockOrders, onDismiss]);

  if (visibleOrders.length === 0) return null;

  return (
    <div className="space-y-3">
      {visibleOrders.map((order) => {
        const unavailable = orderUnavailableItems(order.items);
        return (
          <div
            key={order.id}
            className="rounded-2xl border border-amber-500/30 bg-amber-500/15 p-4 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-amber-100">
                  We&apos;re sorry — your order could not be fulfilled
                </p>
                <p className="mt-1 text-sm text-amber-200/80">
                  Everything in order #{order.orderNumber} is out of stock. Please choose other
                  items from the menu. This notice stays until you refresh it or add something new
                  to your cart.
                </p>
                <ul className="mt-2 space-y-1 text-sm text-amber-100">
                  {unavailable.map((item, index) => (
                    <li key={`${item.itemName}-${index}`}>
                      {item.itemName} × {item.quantity}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => {
                    dismissOutOfStockNotice(order.id);
                    onDismiss();
                  }}
                  className="mt-3 text-sm font-medium text-amber-300 underline underline-offset-2 hover:text-amber-200"
                >
                  Refresh to dismiss
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

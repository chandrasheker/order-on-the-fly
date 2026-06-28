"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import {
  dismissOutOfStockOrder,
  readDismissedOutOfStockOrderIds,
} from "@/lib/oos-notice-dismiss";
import { isOrderFullyOutOfStock, orderUnavailableItems } from "@/lib/utils";

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

type Props = {
  orders: Order[];
  tableToken: string;
  refreshTick: number;
  onDismiss: () => void;
};

export function OutOfStockNotice({ orders, tableToken, refreshTick, onDismiss }: Props) {
  const fullyOutOfStockOrders = useMemo(
    () => orders.filter((order) => isOrderFullyOutOfStock(order.items)),
    [orders],
  );

  const visibleOrders = useMemo(() => {
    void refreshTick;
    const dismissed = new Set(readDismissedOutOfStockOrderIds(tableToken));
    return fullyOutOfStockOrders.filter((order) => !dismissed.has(order.id));
  }, [fullyOutOfStockOrders, refreshTick, tableToken]);

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
                  items from the menu.
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
                    dismissOutOfStockOrder(tableToken, order.id);
                    onDismiss();
                  }}
                  className="mt-3 text-sm font-medium text-amber-300 underline underline-offset-2 hover:text-amber-200"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

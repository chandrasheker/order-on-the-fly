"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { formatCountdown, getRemainingSeconds } from "@/lib/utils";
import { Button, Badge } from "@/components/ui";
import { Bell, Clock, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";

interface OrderItem {
  id: string;
  itemName: string;
  quantity: number;
  status: string;
  prepTimeMinutes: number;
  expectedReadyAt: string;
  isOverdue: boolean;
}

interface Order {
  id: string;
  orderNumber: number;
  status: string;
  alarmTriggered: boolean;
  items: OrderItem[];
  createdAt: string;
}

function hasPendingItems(order: Order) {
  return order.items.some((i) => i.status !== "SERVED");
}

export function OrderTracker({
  orders,
  tableToken,
  onRefresh,
}: {
  orders: Order[];
  tableToken: string;
  onRefresh: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [alarmSent, setAlarmSent] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(onRefresh, 10000);
    return () => clearInterval(interval);
  }, [onRefresh]);

  // Keep orders visible while any item is still pending; hide only after refresh shows all served.
  const visibleOrders = orders.filter(hasPendingItems);

  if (visibleOrders.length === 0) return null;

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  const triggerAlarm = async (orderId: string) => {
    await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "alarm" }),
    });
    setAlarmSent(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-300">Your orders</p>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {visibleOrders.map((order) => {
        const pendingItems = order.items.filter((i) => i.status !== "SERVED");
        const maxExpected = pendingItems.reduce((max, item) => {
          const t = new Date(item.expectedReadyAt).getTime();
          return t > max ? t : max;
        }, 0);
        const remaining = pendingItems.length
          ? Math.max(0, Math.floor((maxExpected - now) / 1000))
          : 0;
        const anyOverdue = pendingItems.some((i) => i.isOverdue);
        const servedCount = order.items.length - pendingItems.length;

        return (
          <motion.div
            key={order.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-zinc-400">Order #{order.orderNumber}</p>
                <Badge
                  className={
                    pendingItems.length === 0
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : anyOverdue
                      ? "bg-red-500/15 text-red-400 border-red-500/30 animate-pulse"
                      : remaining === 0
                      ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                      : "bg-blue-500/15 text-blue-400 border-blue-500/30"
                  }
                >
                  {pendingItems.length === 0
                    ? "All Served!"
                    : servedCount > 0
                    ? `${servedCount} served · ${pendingItems.length} preparing`
                    : anyOverdue
                    ? "Taking longer than expected"
                    : remaining > 0
                    ? "Preparing your order"
                    : "Almost ready!"}
                </Badge>
              </div>
              {pendingItems.length > 0 && (
                <div className="text-right">
                  <div className="flex items-center gap-1.5 text-2xl font-mono font-bold text-white">
                    <Clock className="w-5 h-5 text-orange-400" />
                    {remaining > 0 ? formatCountdown(remaining) : "0:00"}
                  </div>
                  <p className="text-xs text-zinc-500">estimated wait</p>
                </div>
              )}
            </div>

            <div className="space-y-2 mb-4">
              {order.items.map((item) => {
                const isServed = item.status === "SERVED";
                const itemRemaining = getRemainingSeconds(item.expectedReadyAt);

                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between py-2 px-3 rounded-xl transition-all ${
                      isServed
                        ? "bg-black/50 border border-white/5 opacity-50"
                        : "bg-white/10 border border-orange-500/25 shadow-sm shadow-orange-500/10"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isServed ? (
                        <CheckCircle2 className="w-4 h-4 text-zinc-500 shrink-0" />
                      ) : item.isOverdue ? (
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                      ) : (
                        <Clock className="w-4 h-4 text-orange-400 shrink-0" />
                      )}
                      <span
                        className={`text-sm truncate ${
                          isServed ? "text-zinc-500 line-through" : "text-white font-medium"
                        }`}
                      >
                        {item.quantity}x {item.itemName}
                      </span>
                    </div>
                    <span
                      className={`text-xs shrink-0 ml-2 ${
                        isServed ? "text-zinc-600" : "text-orange-300 font-medium"
                      }`}
                    >
                      {isServed
                        ? "Served"
                        : item.isOverdue
                        ? "Delayed"
                        : itemRemaining > 0
                        ? formatCountdown(itemRemaining)
                        : "Ready soon"}
                    </span>
                  </div>
                );
              })}
            </div>

            {(remaining === 0 || anyOverdue) && pendingItems.length > 0 && !alarmSent && !order.alarmTriggered && (
              <Button
                variant="danger"
                className="w-full animate-pulse"
                onClick={() => triggerAlarm(order.id)}
              >
                <Bell className="w-4 h-4" />
                Ring for Service — We&apos;re taking too long!
              </Button>
            )}

            {(alarmSent || order.alarmTriggered) && pendingItems.length > 0 && (
              <p className="text-center text-sm text-amber-400 animate-pulse">
                🔔 Staff has been notified! Someone is on the way...
              </p>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

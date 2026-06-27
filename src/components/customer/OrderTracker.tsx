"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { formatCountdown, getRemainingSeconds } from "@/lib/utils";
import { Button, Badge } from "@/components/ui";
import { Bell, Clock, CheckCircle2, AlertTriangle } from "lucide-react";

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

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(onRefresh, 10000);
    return () => clearInterval(interval);
  }, [onRefresh]);

  const activeOrders = orders.filter((o) => o.status !== "SERVED");

  if (activeOrders.length === 0) return null;

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
      {activeOrders.map((order) => {
        const maxExpected = order.items.reduce((max, item) => {
          const t = new Date(item.expectedReadyAt).getTime();
          return t > max ? t : max;
        }, 0);
        const remaining = Math.max(0, Math.floor((maxExpected - now) / 1000));
        const anyOverdue = order.items.some(
          (i) => i.isOverdue && i.status !== "SERVED"
        );
        const allServed = order.items.every((i) => i.status === "SERVED");

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
                    allServed
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : anyOverdue
                      ? "bg-red-500/15 text-red-400 border-red-500/30 animate-pulse"
                      : remaining === 0
                      ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                      : "bg-blue-500/15 text-blue-400 border-blue-500/30"
                  }
                >
                  {allServed
                    ? "All Served!"
                    : anyOverdue
                    ? "Taking longer than expected"
                    : remaining > 0
                    ? "Preparing your order"
                    : "Almost ready!"}
                </Badge>
              </div>
              {!allServed && (
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
                const itemRemaining = getRemainingSeconds(item.expectedReadyAt);
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-2 px-3 rounded-xl bg-white/5"
                  >
                    <div className="flex items-center gap-2">
                      {item.status === "SERVED" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : item.isOverdue ? (
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                      ) : (
                        <Clock className="w-4 h-4 text-orange-400" />
                      )}
                      <span className="text-sm text-white">
                        {item.quantity}x {item.itemName}
                      </span>
                    </div>
                    <span className="text-xs text-zinc-400">
                      {item.status === "SERVED"
                        ? "Served ✓"
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

            {(remaining === 0 || anyOverdue) && !allServed && !alarmSent && !order.alarmTriggered && (
              <Button
                variant="danger"
                className="w-full animate-pulse"
                onClick={() => triggerAlarm(order.id)}
              >
                <Bell className="w-4 h-4" />
                Ring for Service — We&apos;re taking too long!
              </Button>
            )}

            {(alarmSent || order.alarmTriggered) && !allServed && (
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

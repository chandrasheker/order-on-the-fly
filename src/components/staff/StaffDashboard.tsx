"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  ChefHat,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  LogOut,
  LayoutDashboard,
  QrCode,
  BarChart3,
  Utensils,
} from "lucide-react";
import { Button, Badge, Card, Spinner } from "@/components/ui";
import { formatCurrency, formatCountdown, getStatusColor, cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface OrderItem {
  id: string;
  itemName: string;
  quantity: number;
  status: string;
  prepTimeMinutes: number;
  expectedReadyAt: string;
  isOverdue: boolean;
  menuItem: { isAvailable: boolean; category: { name: string } };
}

interface Order {
  id: string;
  orderNumber: number;
  customerName: string | null;
  status: string;
  alarmTriggered: boolean;
  table: { number: number };
  items: OrderItem[];
  createdAt: string;
}

interface Alert {
  id: string;
  type: string;
  message: string;
  tableNumber: number;
  isRead: boolean;
  createdAt: string;
}

interface Stats {
  activeOrders: number;
  todayOrders: number;
  revenue: number;
  overdueCount: number;
  unreadAlerts: number;
}

export function StaffDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; role: string; restaurantName: string } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [filter, setFilter] = useState<"all" | "overdue" | "alarm">("all");

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchData = useCallback(async () => {
    const [meRes, dashRes] = await Promise.all([
      fetch("/api/auth/me"),
      fetch("/api/staff/dashboard"),
    ]);

    if (!meRes.ok) {
      router.push("/staff/login");
      return;
    }
    const me = await meRes.json();
    setUser(me.user);

    if (dashRes.ok) {
      const data = await dashRes.json();
      setOrders(data.orders);
      setAlerts(data.alerts);
      setStats(data.stats);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const updateItem = async (orderId: string, itemId: string, action: string) => {
    await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, itemId }),
    });
    fetchData();
  };

  const dismissAlerts = async () => {
    await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    fetchData();
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/staff/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a12]">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  const filteredOrders = orders.filter((o) => {
    if (filter === "overdue") return o.items.some((i) => i.isOverdue && i.status !== "SERVED");
    if (filter === "alarm") return o.alarmTriggered;
    return true;
  });

  const isManager = user?.role === "OWNER" || user?.role === "MANAGER";

  return (
    <div className="min-h-screen bg-[#0a0a12] text-white">
      {/* Alert banner */}
      <AnimatePresence>
        {alerts.length > 0 && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="bg-red-500/20 border-b border-red-500/30 overflow-hidden"
          >
            <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-300 text-sm">
                <Bell className="w-4 h-4 animate-bounce" />
                <span className="font-medium">{alerts.length} alert{alerts.length > 1 ? "s" : ""}</span>
                <span className="text-red-400/70 hidden sm:inline">— {alerts[0]?.message}</span>
              </div>
              <button onClick={dismissAlerts} className="text-xs text-red-300 hover:text-white">
                Dismiss all
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="border-b border-white/5 bg-[#0a0a12]/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{user?.restaurantName}</h1>
            <p className="text-sm text-zinc-400">
              {user?.name} · <span className="text-orange-400 capitalize">{user?.role?.toLowerCase()}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchData} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400">
              <RefreshCw className="w-4 h-4" />
            </button>
            {isManager && (
              <>
                <Link href="/admin/qr" className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400">
                  <QrCode className="w-4 h-4" />
                </Link>
                <Link href="/admin/menu" className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400">
                  <Utensils className="w-4 h-4" />
                </Link>
                <Link href="/admin/reports" className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400">
                  <BarChart3 className="w-4 h-4" />
                </Link>
              </>
            )}
            <button onClick={logout} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Active Orders", value: stats.activeOrders, icon: LayoutDashboard, color: "text-orange-400" },
              { label: "Today's Orders", value: stats.todayOrders, icon: ChefHat, color: "text-blue-400" },
              { label: "Revenue Today", value: formatCurrency(stats.revenue), icon: BarChart3, color: "text-emerald-400" },
              { label: "Overdue Items", value: stats.overdueCount, icon: AlertTriangle, color: stats.overdueCount > 0 ? "text-red-400" : "text-zinc-400" },
            ].map((s) => (
              <Card key={s.label} className="p-4">
                <div className="flex items-center gap-3">
                  <s.icon className={cn("w-5 h-5", s.color)} />
                  <div>
                    <p className="text-xs text-zinc-500">{s.label}</p>
                    <p className="text-xl font-bold">{s.value}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 mb-4">
          {(["all", "overdue", "alarm"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-medium transition-all border",
                filter === f
                  ? "bg-orange-500/20 border-orange-500/50 text-orange-300"
                  : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
              )}
            >
              {f === "all" ? "All Orders" : f === "overdue" ? "⚠️ Overdue" : "🔔 Alarms"}
            </button>
          ))}
        </div>

        {/* Orders grid */}
        {filteredOrders.length === 0 ? (
          <Card className="p-12 text-center">
            <ChefHat className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400">No active orders. Waiting for customers...</p>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredOrders.map((order) => (
              <motion.div
                key={order.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className={cn(
                  "rounded-2xl border p-5 backdrop-blur-xl",
                  order.alarmTriggered
                    ? "border-red-500/50 bg-red-500/10 animate-pulse"
                    : order.items.some((i) => i.isOverdue)
                    ? "border-amber-500/30 bg-amber-500/5"
                    : "border-white/10 bg-white/5"
                )}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold">T{order.table.number}</span>
                      {order.alarmTriggered && (
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/30 animate-bounce">
                          🚨 ALARM
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-zinc-400">
                      #{order.orderNumber}
                      {order.customerName && ` · ${order.customerName}`}
                    </p>
                  </div>
                  <Badge className={getStatusColor(order.status)}>
                    {order.status}
                  </Badge>
                </div>

                <div className="space-y-2 mb-4">
                  {order.items.map((item) => {
                    const remaining = Math.max(
                      0,
                      Math.floor((new Date(item.expectedReadyAt).getTime() - now) / 1000)
                    );
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "p-3 rounded-xl border",
                          item.isOverdue && item.status !== "SERVED"
                            ? "bg-red-500/10 border-red-500/30"
                            : "bg-white/5 border-white/10"
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">
                            {item.quantity}x {item.itemName}
                          </span>
                          {item.status !== "SERVED" && (
                            <span className={cn(
                              "text-xs font-mono",
                              item.isOverdue ? "text-red-400" : "text-zinc-400"
                            )}>
                              {item.isOverdue ? "OVERDUE" : remaining > 0 ? formatCountdown(remaining) : "Due now"}
                            </span>
                          )}
                        </div>
                        {item.status !== "SERVED" && (
                          <div className="flex gap-1.5">
                            {item.status === "PENDING" && (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="flex-1 text-xs"
                                onClick={() => updateItem(order.id, item.id, "prepare-item")}
                              >
                                Start
                              </Button>
                            )}
                            {(item.status === "PENDING" || item.status === "PREPARING") && (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="flex-1 text-xs"
                                onClick={() => updateItem(order.id, item.id, "ready-item")}
                              >
                                Ready
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="success"
                              className="flex-1 text-xs"
                              onClick={() => updateItem(order.id, item.id, "serve-item")}
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Serve
                            </Button>
                          </div>
                        )}
                        {item.status === "SERVED" && (
                          <span className="text-xs text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Served
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  className="w-full"
                  onClick={() => updateItem(order.id, "", "serve-all")}
                >
                  Mark All Served
                </Button>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

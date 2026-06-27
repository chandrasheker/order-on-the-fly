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
  History,
  Gift,
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
  servedAt?: string | null;
  isOverdue: boolean;
  unitPrice?: number;
  menuItem?: { isAvailable: boolean; category: { name: string } };
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
  total?: number;
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
  servedToday: number;
  revenue: number;
  overdueCount: number;
  unreadAlerts: number;
}

type ViewMode = "active" | "today" | "revenue" | "overdue";
type ItemFilter = "all" | "overdue" | "alarm";

export function StaffDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; role: string; restaurantName: string } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [todayOrders, setTodayOrders] = useState<Order[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [viewMode, setViewMode] = useState<ViewMode>("active");
  const [itemFilter, setItemFilter] = useState<ItemFilter>("all");

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [meRes, dashRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/staff/dashboard"),
      ]);

      if (!meRes.ok) {
        router.push("/");
        return;
      }
      const me = await meRes.json();
      if (!me.user) {
        router.push("/");
        return;
      }
      setUser(me.user);

      if (dashRes.ok) {
        const data = await dashRes.json();
        setOrders(data.orders);
        setTodayOrders(data.todayOrders);
        setAlerts(data.alerts);
        setStats(data.stats);
      }
    } catch (error) {
      console.error("Dashboard fetch failed:", error);
    } finally {
      setLoading(false);
    }
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
    router.push("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a12]">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  const filteredActive = orders.filter((o) => {
    if (itemFilter === "overdue") return o.items.some((i) => i.isOverdue && i.status !== "SERVED");
    if (itemFilter === "alarm") return o.alarmTriggered;
    return true;
  });

  const isManager = user?.role === "OWNER" || user?.role === "MANAGER";

  return (
    <div className="min-h-screen bg-[#0a0a12] text-white">
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
                <Link href="/admin/rewards" className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 relative">
                  <Gift className="w-4 h-4" />
                </Link>
              </>
            )}
            <Link href="/admin/reports" className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400">
              <BarChart3 className="w-4 h-4" />
            </Link>
            <button onClick={logout} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <button
              onClick={() => { setViewMode("active"); setItemFilter("all"); }}
              className={cn(
                "text-left rounded-2xl border p-4 transition-all",
                viewMode === "active"
                  ? "border-orange-500/50 bg-orange-500/10"
                  : "border-white/10 bg-white/5 hover:border-white/20"
              )}
            >
              <div className="flex items-center gap-3">
                <LayoutDashboard className="w-5 h-5 text-orange-400" />
                <div>
                  <p className="text-xs text-zinc-500">Active Orders</p>
                  <p className="text-xl font-bold">{stats.activeOrders}</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setViewMode("today")}
              className={cn(
                "text-left rounded-2xl border p-4 transition-all",
                viewMode === "today"
                  ? "border-blue-500/50 bg-blue-500/10"
                  : "border-white/10 bg-white/5 hover:border-white/20"
              )}
            >
              <div className="flex items-center gap-3">
                <History className="w-5 h-5 text-blue-400" />
                <div>
                  <p className="text-xs text-zinc-500">Today&apos;s Orders</p>
                  <p className="text-xl font-bold">{stats.todayOrders}</p>
                  <p className="text-xs text-zinc-500">{stats.servedToday} served</p>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setViewMode("revenue")}
              className={cn(
                "text-left rounded-2xl border p-4 transition-all",
                viewMode === "revenue"
                  ? "border-emerald-500/50 bg-emerald-500/10"
                  : "border-white/10 bg-white/5 hover:border-white/20"
              )}
            >
              <div className="flex items-center gap-3">
                <BarChart3 className="w-5 h-5 text-emerald-400" />
                <div>
                  <p className="text-xs text-zinc-500">Revenue Today</p>
                  <p className="text-xl font-bold">{formatCurrency(stats.revenue)}</p>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setViewMode("overdue");
                setItemFilter("overdue");
              }}
              className={cn(
                "text-left rounded-2xl border p-4 transition-all",
                viewMode === "overdue"
                  ? "border-red-500/50 bg-red-500/10"
                  : "border-white/10 bg-white/5 hover:border-white/20"
              )}
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className={cn("w-5 h-5", stats.overdueCount > 0 ? "text-red-400" : "text-zinc-400")} />
                <div>
                  <p className="text-xs text-zinc-500">Overdue Items</p>
                  <p className="text-xl font-bold">{stats.overdueCount}</p>
                </div>
              </div>
            </button>
          </div>
        )}

        {viewMode === "active" && (
          <>
            <div className="flex gap-2 mb-4">
              {(["all", "overdue", "alarm"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setItemFilter(f)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-medium transition-all border",
                    itemFilter === f
                      ? "bg-orange-500/20 border-orange-500/50 text-orange-300"
                      : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
                  )}
                >
                  {f === "all" ? "All Active" : f === "overdue" ? "Overdue" : "Alarms"}
                </button>
              ))}
            </div>

            {filteredActive.length === 0 ? (
              <Card className="p-12 text-center">
                <ChefHat className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-400 mb-2">No active orders right now.</p>
                <button
                  onClick={() => setViewMode("today")}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  View today&apos;s completed orders →
                </button>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredActive.map((order) => (
                  <ActiveOrderCard
                    key={order.id}
                    order={order}
                    now={now}
                    onUpdate={updateItem}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {viewMode === "revenue" && (
          <>
            <p className="text-sm text-zinc-400 mb-4">
              Today&apos;s revenue breakdown by order
            </p>
            <Card className="p-5 mb-4">
              <p className="text-sm text-zinc-500">Total Revenue</p>
              <p className="text-3xl font-bold text-emerald-400">{formatCurrency(stats?.revenue ?? 0)}</p>
              <p className="text-xs text-zinc-500 mt-1">{todayOrders.length} orders today</p>
            </Card>
            <div className="space-y-3">
              {todayOrders.length === 0 ? (
                <Card className="p-8 text-center text-zinc-400">No orders yet today</Card>
              ) : (
                todayOrders.map((order) => (
                  <TodayOrderRow key={order.id} order={order} />
                ))
              )}
            </div>
          </>
        )}

        {viewMode === "overdue" && (
          <>
            <p className="text-sm text-zinc-400 mb-4">
              Items that missed their prep time — needs attention now
            </p>
            {orders.filter((o) => o.items.some((i) => i.isOverdue && i.status !== "SERVED")).length === 0 ? (
              <Card className="p-12 text-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
                <p className="text-zinc-400">No overdue items. All on track!</p>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {orders
                  .filter((o) => o.items.some((i) => i.isOverdue && i.status !== "SERVED"))
                  .map((order) => (
                    <ActiveOrderCard
                      key={order.id}
                      order={order}
                      now={now}
                      onUpdate={updateItem}
                    />
                  ))}
              </div>
            )}
          </>
        )}

        {viewMode === "today" && (
          <>
            <p className="text-sm text-zinc-400 mb-4">
              All orders from today — including served. Data is saved here for the full day.
            </p>
            {todayOrders.length === 0 ? (
              <Card className="p-12 text-center">
                <History className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-400">No orders yet today.</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {todayOrders.map((order) => (
                  <TodayOrderRow key={order.id} order={order} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function ActiveOrderCard({
  order,
  now,
  onUpdate,
}: {
  order: Order;
  now: number;
  onUpdate: (orderId: string, itemId: string, action: string) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "rounded-2xl border p-5 backdrop-blur-xl",
        order.alarmTriggered
          ? "border-red-500/50 bg-red-500/10 animate-pulse"
          : order.items.some((i) => i.isOverdue && i.status !== "SERVED")
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
                ALARM
              </Badge>
            )}
          </div>
          <p className="text-sm text-zinc-400">
            #{order.orderNumber}
            {order.customerName && ` · ${order.customerName}`}
          </p>
        </div>
        <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
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
                  <span className={cn("text-xs font-mono", item.isOverdue ? "text-red-400" : "text-zinc-400")}>
                    {item.isOverdue ? "OVERDUE" : remaining > 0 ? formatCountdown(remaining) : "Due now"}
                  </span>
                )}
              </div>
              {item.status !== "SERVED" && (
                <div className="flex gap-1.5">
                  {item.status === "PENDING" && (
                    <Button size="sm" variant="secondary" className="flex-1 text-xs" onClick={() => onUpdate(order.id, item.id, "prepare-item")}>
                      Start
                    </Button>
                  )}
                  {(item.status === "PENDING" || item.status === "PREPARING") && (
                    <Button size="sm" variant="secondary" className="flex-1 text-xs" onClick={() => onUpdate(order.id, item.id, "ready-item")}>
                      Ready
                    </Button>
                  )}
                  <Button size="sm" variant="success" className="flex-1 text-xs" onClick={() => onUpdate(order.id, item.id, "serve-item")}>
                    <CheckCircle2 className="w-3 h-3" /> Serve
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

      <Button variant="primary" size="sm" className="w-full" onClick={() => onUpdate(order.id, "", "serve-all")}>
        Mark All Served
      </Button>
    </motion.div>
  );
}

function TodayOrderRow({ order }: { order: Order }) {
  const total =
    order.total ??
    order.items.reduce((s, i) => s + (i.unitPrice ?? 0) * i.quantity, 0);

  return (
    <Card className="p-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-lg font-bold">Table {order.table.number}</span>
            <span className="text-zinc-500">#{order.orderNumber}</span>
            <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            {order.customerName && ` · ${order.customerName}`}
          </p>
          <div className="space-y-1">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-zinc-300">
                  {item.quantity}x {item.itemName}
                  {item.status === "SERVED" && item.servedAt && (
                    <span className="text-zinc-500 ml-2">
                      served {new Date(item.servedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </span>
                {item.unitPrice !== undefined && (
                  <span className="text-zinc-400">{formatCurrency(item.unitPrice * item.quantity)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="text-right sm:pl-4 sm:border-l sm:border-white/10">
          <p className="text-xs text-zinc-500">Total</p>
          <p className="text-xl font-bold text-emerald-400">{formatCurrency(total)}</p>
        </div>
      </div>
    </Card>
  );
}

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
  TimerOff,
  X,
  Ban,
} from "lucide-react";
import { Button, Badge, Card, Spinner } from "@/components/ui";
import { formatCurrency, formatCountdown, getStatusColor, cn, isOrderItemOpen } from "@/lib/utils";
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
  missedTimelineCount: number;
  unreadAlerts: number;
}

interface MissedTimelineItem {
  id: string;
  itemName: string;
  quantity: number;
  prepTimeMinutes: number;
  expectedReadyAt: string;
  servedAt: string | null;
  minutesLate: number | null;
  status: string;
  orderNumber: number;
  tableNumber: number;
  currentPrepTime?: number;
}

interface MissedSummary {
  itemName: string;
  count: number;
  prepTimeMinutes: number;
  avgMinutesLate: number;
}

type ViewMode = "active" | "today" | "revenue" | "overdue" | "missed" | "alerts";
type ItemFilter = "all" | "overdue" | "alarm";

export function StaffDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; role: string; restaurantName: string } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [todayOrders, setTodayOrders] = useState<Order[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [missedTimeline, setMissedTimeline] = useState<MissedTimelineItem[]>([]);
  const [missedSummary, setMissedSummary] = useState<MissedSummary[]>([]);
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
        setMissedTimeline(data.missedTimeline ?? []);
        setMissedSummary(data.missedSummary ?? []);
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

  const dismissAlert = async (alertId: string) => {
    await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertIds: [alertId] }),
    });
    fetchData();
  };

  const openAlertsView = () => {
    setViewMode("alerts");
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
    if (itemFilter === "overdue")
      return o.items.some((i) => i.isOverdue && isOrderItemOpen(i.status));
    if (itemFilter === "alarm") return o.alarmTriggered;
    return true;
  });

  const isItemActive = (status: string) => isOrderItemOpen(status);

  const goToOverdueFromAlert = () => {
    setViewMode("overdue");
    setItemFilter("overdue");
  };

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
            <button
              type="button"
              onClick={openAlertsView}
              className="w-full max-w-7xl mx-auto px-4 py-2 flex items-center justify-between text-left hover:bg-red-500/10 transition-colors"
            >
              <div className="flex items-center gap-2 text-red-300 text-sm min-w-0">
                <Bell className="w-4 h-4 animate-bounce shrink-0" />
                <span className="font-medium shrink-0">
                  {alerts.length} alert{alerts.length > 1 ? "s" : ""}
                </span>
                <span className="text-red-400/70 truncate hidden sm:inline">
                  — {alerts[0]?.message}
                </span>
                <span className="text-xs text-red-300/80 sm:hidden">Tap to view</span>
              </div>
              <span className="text-xs text-red-300 shrink-0 ml-2 hidden sm:inline">View all →</span>
            </button>
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
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

            <button
              type="button"
              onClick={() => setViewMode("missed")}
              className={cn(
                "text-left rounded-2xl border p-4 transition-all",
                viewMode === "missed"
                  ? "border-amber-500/50 bg-amber-500/10"
                  : "border-white/10 bg-white/5 hover:border-white/20"
              )}
            >
              <div className="flex items-center gap-3">
                <TimerOff className={cn("w-5 h-5", stats.missedTimelineCount > 0 ? "text-amber-400" : "text-zinc-400")} />
                <div>
                  <p className="text-xs text-zinc-500">Missed Timelines</p>
                  <p className="text-xl font-bold">{stats.missedTimelineCount}</p>
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
            {orders.filter((o) => o.items.some((i) => i.isOverdue && isItemActive(i.status))).length === 0 ? (
              <Card className="p-12 text-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
                <p className="text-zinc-400">No overdue items. All on track!</p>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {orders
                  .filter((o) => o.items.some((i) => i.isOverdue && isItemActive(i.status)))
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

        {viewMode === "missed" && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <p className="text-sm text-zinc-400">
                Items that missed their prep deadline today — use this to adjust timers in Menu admin.
              </p>
              {(user?.role === "OWNER" || user?.role === "MANAGER") && (
                <Link href="/admin/menu">
                  <Button size="sm" variant="secondary">
                    <Utensils className="w-4 h-4" /> Edit prep timers
                  </Button>
                </Link>
              )}
            </div>

            {missedSummary.length > 0 && (
              <Card className="p-4 mb-4">
                <h3 className="text-sm font-semibold text-zinc-300 mb-3">Most missed items today</h3>
                <div className="space-y-2">
                  {missedSummary.slice(0, 8).map((row) => (
                    <div
                      key={row.itemName}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm py-2 border-b border-white/5 last:border-0"
                    >
                      <span className="font-medium">{row.itemName}</span>
                      <span className="text-zinc-500">
                        {row.count}× missed · timer {row.prepTimeMinutes} min · avg{" "}
                        <span className="text-amber-400">{row.avgMinutesLate} min late</span>
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {missedTimeline.length === 0 ? (
              <Card className="p-12 text-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
                <p className="text-zinc-400">No missed timelines today. Great service!</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {missedTimeline.map((item) => (
                  <Card key={item.id} className="p-4 border-amber-500/20">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <p className="font-semibold">
                          {item.quantity}× {item.itemName}
                        </p>
                        <p className="text-sm text-zinc-500">
                          Table {item.tableNumber} · Order #{item.orderNumber} · Allowed{" "}
                          {item.prepTimeMinutes} min
                          {item.currentPrepTime !== undefined &&
                            item.currentPrepTime !== item.prepTimeMinutes &&
                            ` (menu now ${item.currentPrepTime} min)`}
                        </p>
                        <p className="text-xs text-zinc-500 mt-1">
                          Due{" "}
                          {new Date(item.expectedReadyAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {item.servedAt
                            ? ` · Served ${new Date(item.servedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                            : ` · Still ${item.status.toLowerCase()}`}
                        </p>
                      </div>
                      <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 shrink-0">
                        {item.minutesLate ?? "?"} min late
                      </Badge>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {viewMode === "alerts" && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <p className="text-sm text-zinc-400">
                Active alerts — overdue items and customer alarms
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={goToOverdueFromAlert}>
                  <AlertTriangle className="w-4 h-4" /> View overdue orders
                </Button>
                {alerts.length > 0 && (
                  <Button size="sm" variant="secondary" onClick={dismissAlerts}>
                    Dismiss all
                  </Button>
                )}
              </div>
            </div>

            {alerts.length === 0 ? (
              <Card className="p-12 text-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
                <p className="text-zinc-400">No active alerts.</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <Card
                    key={alert.id}
                    className={cn(
                      "p-4",
                      alert.type === "OVERDUE"
                        ? "border-red-500/30"
                        : "border-amber-500/30"
                    )}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge
                            className={
                              alert.type === "OVERDUE"
                                ? "bg-red-500/15 text-red-400 border-red-500/30"
                                : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                            }
                          >
                            {alert.type === "OVERDUE" ? "Overdue" : "Alarm"}
                          </Badge>
                          <span className="text-sm text-zinc-500">Table {alert.tableNumber}</span>
                        </div>
                        <p className="font-medium text-white">{alert.message}</p>
                        <p className="text-xs text-zinc-500 mt-1">
                          {new Date(alert.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {alert.type === "OVERDUE" && (
                          <Button size="sm" variant="secondary" onClick={goToOverdueFromAlert}>
                            View order
                          </Button>
                        )}
                        <Button size="sm" variant="secondary" onClick={() => dismissAlert(alert.id)}>
                          <X className="w-3.5 h-3.5" /> Dismiss
                        </Button>
                      </div>
                    </div>
                  </Card>
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
          : order.items.some((i) => i.isOverdue && isOrderItemOpen(i.status))
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
                item.isOverdue && isOrderItemOpen(item.status)
                  ? "bg-red-500/10 border-red-500/30"
                  : "bg-white/5 border-white/10"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">
                  {item.quantity}x {item.itemName}
                </span>
                {isOrderItemOpen(item.status) && (
                  <span className={cn("text-xs font-mono", item.isOverdue ? "text-red-400" : "text-zinc-400")}>
                    {item.isOverdue ? "OVERDUE" : remaining > 0 ? formatCountdown(remaining) : "Due now"}
                  </span>
                )}
              </div>
              {isOrderItemOpen(item.status) && (
                <div className="flex flex-col gap-1.5">
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
                  <Button
                    size="sm"
                    variant="danger"
                    className="w-full text-xs"
                    onClick={() => onUpdate(order.id, item.id, "reject-item")}
                  >
                    <Ban className="w-3 h-3" /> Out of stock / Can&apos;t serve
                  </Button>
                </div>
              )}
              {item.status === "SERVED" && (
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Served
                </span>
              )}
              {item.status === "UNAVAILABLE" && (
                <span className="text-xs text-zinc-500 flex items-center gap-1">
                  <Ban className="w-3 h-3" /> Out of stock — not served
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

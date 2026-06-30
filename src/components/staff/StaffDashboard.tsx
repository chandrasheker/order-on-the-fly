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
  Volume2,
  Wallet,
  CircleDollarSign,
  ArrowRightLeft,
  LayoutGrid,
  Phone,
} from "lucide-react";
import { Button, Badge, Card, Spinner } from "@/components/ui";
import { formatCurrency, formatCountdown, getStatusColor, cn, isOrderItemOpen, orderItemLineTotal, sumOrderRevenue } from "@/lib/utils";
import { canAccessTab, canPerformOrderAction, canAccessAdminMenu, canAccessReports, type StaffTab } from "@/lib/staff-permissions";
import type { Role } from "@/generated/prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStaffNotifications } from "@/hooks/useStaffNotifications";
import { TableOrderingPanel } from "@/components/staff/TableOrderingPanel";
import { SplitPaymentPanel } from "@/components/staff/SplitPaymentPanel";
import { OfflineOrderPanel } from "@/components/staff/OfflineOrderPanel";
import { ThermalPrinterButton } from "@/components/staff/ThermalPrinterButton";
import { useThermalPrinter } from "@/hooks/useThermalPrinter";
import {
  canManageTableOrdering,
  canAccessKitchen,
  canAccessFloorPlan,
  canPlaceOfflineOrder,
} from "@/lib/staff-permissions";
import type { ReceiptPayload } from "@/lib/receipt-service";

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
  servedByName?: string | null;
  preparedByName?: string | null;
  readyByName?: string | null;
  menuItem?: { isAvailable: boolean; category: { name: string } };
}

interface Order {
  id: string;
  orderNumber: number;
  customerName: string | null;
  status: string;
  alarmTriggered: boolean;
  paidAt?: string | null;
  table: { number: number };
  items: OrderItem[];
  createdAt: string;
  total?: number;
  paidTotal?: number;
  paymentSummary?: {
    total: number;
    paid: number;
    remaining: number;
    fullyPaid: boolean;
    items: Array<{
      id: string;
      itemName: string;
      quantity: number;
      status: string;
      lineTotal: number;
      paid: number;
      remaining: number;
    }>;
    payments: Array<{
      id: string;
      amount: number;
      method: string;
      collectedByName: string | null;
      createdAt: string;
    }>;
  } | null;
  placedByName?: string | null;
  paidByName?: string | null;
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
  pendingPayments: number;
  completedOrders: number;
  todayOrders: number;
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

interface TableSwitchRequest {
  id: string;
  status: string;
  customerName: string | null;
  note: string | null;
  sourceTableNumber: number;
  targetTableNumber: number;
  requestedAt: string;
}

type ViewMode = StaffTab;
type ItemFilter = "all" | "overdue" | "alarm";

type RestaurantFeatures = {
  kds?: boolean;
  floor_plan?: boolean;
  split_bill?: boolean;
  phone_orders?: boolean;
  thermal_receipts?: boolean;
  staff_performance?: boolean;
  gst_receipts?: boolean;
};

export function StaffDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; role: Role; restaurantName: string } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [completedOrders, setCompletedOrders] = useState<Order[]>([]);
  const [allowedTabs, setAllowedTabs] = useState<StaffTab[]>(["active"]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [missedTimeline, setMissedTimeline] = useState<MissedTimelineItem[]>([]);
  const [missedSummary, setMissedSummary] = useState<MissedSummary[]>([]);
  const [tableSwitchRequests, setTableSwitchRequests] = useState<TableSwitchRequest[]>([]);
  const [handlingSwitchId, setHandlingSwitchId] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [viewMode, setViewMode] = useState<ViewMode>("active");
  const [itemFilter, setItemFilter] = useState<ItemFilter>("all");
  const [features, setFeatures] = useState<RestaurantFeatures>({});

  const { alertsEnabled, showEnableBanner, enableAlerts, enabling, statusMessage } =
    useStaffNotifications(alerts);
  const { printReceipt, autoPrint, supported: printerSupported, connect, deviceName, lastError, printing, status, toggleAutoPrint } = useThermalPrinter();
  const [printMessage, setPrintMessage] = useState<string | null>(null);

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
        setPendingOrders(data.pendingOrders ?? []);
        setCompletedOrders(data.completedOrders ?? []);
        setAllowedTabs(data.permissions?.tabs ?? ["active"]);
        setAlerts(data.alerts);
        setMissedTimeline(data.missedTimeline ?? []);
        setMissedSummary(data.missedSummary ?? []);
        setTableSwitchRequests(data.tableSwitchRequests ?? []);
        setStats(data.stats);
        setFeatures(data.features ?? {});
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
      body: JSON.stringify({ action, itemId: itemId || undefined }),
    });
    fetchData();
  };

  const handleTableSwitch = async (requestId: string, action: "approve" | "reject") => {
    setHandlingSwitchId(requestId);
    try {
      const res = await fetch(`/api/table-switch/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error || "Could not update table switch request");
      }
      await fetchData();
    } finally {
      setHandlingSwitchId(null);
    }
  };

  const handlePaymentComplete = async (
    res: Response,
    json: { error?: string; receipt?: ReceiptPayload },
  ) => {
    if (!res.ok) {
      alert(json.error || "Could not record payment");
      fetchData();
      return;
    }

    fetchData();

    if (printerSupported && autoPrint && json.receipt) {
      try {
        await printReceipt(json.receipt);
        setPrintMessage("Receipt sent to printer.");
      } catch (error) {
        setPrintMessage(
          error instanceof Error ? error.message : "Payment saved, but receipt print failed.",
        );
      }
      window.setTimeout(() => setPrintMessage(null), 5000);
    }
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

  const isManager = user ? canAccessAdminMenu(user.role) : false;
  const role = user?.role;
  const showTab = (tab: StaffTab) => role && canAccessTab(role, tab) && allowedTabs.includes(tab);

  return (
    <div className="min-h-screen bg-[#0a0a12] text-white">
      <AnimatePresence>
        {showEnableBanner && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-violet-500/15 border-b border-violet-500/30 overflow-hidden"
          >
            <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-start gap-2 text-sm text-violet-200">
                <Volume2 className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  Tap below to turn on the buzzer for overdue items and when a customer rings
                  for service. Allow notifications if your browser asks.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => void enableAlerts()}
                disabled={enabling}
                className="shrink-0 w-full sm:w-auto"
              >
                {enabling ? "Enabling…" : "Enable alerts"}
              </Button>
            </div>
          </motion.div>
        )}
        {statusMessage && !showEnableBanner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-emerald-500/10 border-b border-emerald-500/20"
          >
            <p className="max-w-7xl mx-auto px-4 py-2 text-xs text-emerald-300 text-center sm:text-left">
              {statusMessage}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

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
            {!alertsEnabled && (
              <button
                type="button"
                onClick={() => void enableAlerts()}
                disabled={enabling}
                className="p-2 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 disabled:opacity-50"
                title="Enable sound alerts"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={fetchData} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400">
              <RefreshCw className="w-4 h-4" />
            </button>
            {user && canAccessKitchen(user.role) && features.kds && (
              <Link href="/kitchen" className="p-2 rounded-xl bg-orange-500/15 hover:bg-orange-500/25 text-orange-300" title="Kitchen display">
                <ChefHat className="w-4 h-4" />
              </Link>
            )}
            {user && canAccessFloorPlan(user.role) && features.floor_plan && (
              <Link href="/staff/floor" className="p-2 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 text-violet-300" title="Floor plan">
                <LayoutGrid className="w-4 h-4" />
              </Link>
            )}
            {user && canPlaceOfflineOrder(user.role) && features.phone_orders && (
              <button
                type="button"
                onClick={() => setViewMode("offline")}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors",
                  viewMode === "offline"
                    ? "bg-violet-500/20 border-violet-500/40 text-violet-200"
                    : "bg-violet-500/10 border-violet-500/20 text-violet-300 hover:bg-violet-500/20",
                )}
                title="Phone / offline orders"
              >
                <Phone className="w-4 h-4" />
                <span className="hidden sm:inline">Phone orders</span>
              </button>
            )}
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
            {user && canAccessReports(user.role) && (
              <Link href="/admin/reports" className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400">
                <BarChart3 className="w-4 h-4" />
              </Link>
            )}
            {user && canPerformOrderAction(user.role, "mark-paid") && features.thermal_receipts && (
              <ThermalPrinterButton
                status={status}
                deviceName={deviceName}
                autoPrint={autoPrint}
                lastError={lastError}
                printing={printing}
                supported={printerSupported}
                onConnect={connect}
                onToggleAutoPrint={toggleAutoPrint}
              />
            )}
            <button onClick={logout} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {printMessage && (
          <div className="mb-4 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
            {printMessage}
          </div>
        )}
        {user && canManageTableOrdering(user.role) && <TableOrderingPanel />}

        {tableSwitchRequests.length > 0 && (
          <div className="mb-6 p-4 rounded-2xl border border-sky-500/30 bg-sky-500/10">
            <div className="flex items-center gap-2 mb-3">
              <ArrowRightLeft className="w-5 h-5 text-sky-300" />
              <div>
                <p className="font-semibold text-sky-200">Table switch requests</p>
                <p className="text-xs text-zinc-400">
                  Approving moves the active order/payment from the old table to the new table.
                </p>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {tableSwitchRequests.map((request) => (
                <div
                  key={request.id}
                  className="p-3 rounded-xl bg-black/20 border border-white/10 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="font-medium text-white">
                      Table {request.sourceTableNumber} → Table {request.targetTableNumber}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {request.customerName ? `${request.customerName} · ` : ""}
                      Requested {new Date(request.requestedAt).toLocaleTimeString()}
                    </p>
                    {request.note && (
                      <p className="text-xs text-sky-200/80 mt-1">{request.note}</p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={handlingSwitchId === request.id}
                      onClick={() => void handleTableSwitch(request.id, "reject")}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      variant="success"
                      disabled={handlingSwitchId === request.id}
                      onClick={() => void handleTableSwitch(request.id, "approve")}
                    >
                      Approve
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            {showTab("active") && (
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
            )}

            {showTab("pending") && (
              <button
                onClick={() => setViewMode("pending")}
                className={cn(
                  "text-left rounded-2xl border p-4 transition-all",
                  viewMode === "pending"
                    ? "border-yellow-500/50 bg-yellow-500/10"
                    : "border-white/10 bg-white/5 hover:border-white/20"
                )}
              >
                <div className="flex items-center gap-3">
                  <Wallet className="w-5 h-5 text-yellow-400" />
                  <div>
                    <p className="text-xs text-zinc-500">Pending Payments</p>
                    <p className="text-xl font-bold">{stats.pendingPayments}</p>
                  </div>
                </div>
              </button>
            )}

            {showTab("completed") && (
              <button
                onClick={() => setViewMode("completed")}
                className={cn(
                  "text-left rounded-2xl border p-4 transition-all",
                  viewMode === "completed"
                    ? "border-blue-500/50 bg-blue-500/10"
                    : "border-white/10 bg-white/5 hover:border-white/20"
                )}
              >
                <div className="flex items-center gap-3">
                  <History className="w-5 h-5 text-blue-400" />
                  <div>
                    <p className="text-xs text-zinc-500">Completed Orders</p>
                    <p className="text-xl font-bold">{stats.completedOrders}</p>
                  </div>
                </div>
              </button>
            )}

            {showTab("revenue") && (
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
                  <CircleDollarSign className="w-5 h-5 text-emerald-400" />
                  <div>
                    <p className="text-xs text-zinc-500">Revenue Today</p>
                    <p className="text-xl font-bold">{formatCurrency(stats.revenue)}</p>
                  </div>
                </div>
              </button>
            )}

            {showTab("overdue") && (
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
            )}

            {showTab("missed") && (
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
            )}

            {showTab("offline") && (
              <button
                type="button"
                onClick={() => setViewMode("offline")}
                className={cn(
                  "text-left rounded-2xl border p-4 transition-all col-span-2 md:col-span-1",
                  viewMode === "offline"
                    ? "border-violet-500/50 bg-violet-500/10"
                    : "border-violet-500/20 bg-violet-500/5 hover:border-violet-500/40"
                )}
              >
                <div className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-violet-400" />
                  <div>
                    <p className="text-xs text-zinc-500">Offline Order</p>
                    <p className="text-sm font-semibold text-violet-200">Phone / walk-in</p>
                  </div>
                </div>
              </button>
            )}
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
                {showTab("offline") && (
                  <button
                    onClick={() => setViewMode("offline")}
                    className="text-sm text-violet-400 hover:text-violet-300 mr-4"
                  >
                    Take an offline order →
                  </button>
                )}
                {showTab("pending") && (
                <button
                  onClick={() => setViewMode("pending")}
                  className="text-sm text-yellow-400 hover:text-yellow-300"
                >
                  View pending payments →
                </button>
                )}
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredActive.map((order) => (
                  <ActiveOrderCard
                    key={order.id}
                    order={order}
                    now={now}
                    role={role!}
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
              Today&apos;s revenue from paid orders only (served items, out-of-stock excluded)
            </p>
            <Card className="p-5 mb-4">
              <p className="text-sm text-zinc-500">Total Revenue</p>
              <p className="text-3xl font-bold text-emerald-400">{formatCurrency(stats?.revenue ?? 0)}</p>
              <p className="text-xs text-zinc-500 mt-1">{stats?.completedOrders ?? 0} paid orders today</p>
            </Card>
            <div className="space-y-3">
              {completedOrders.length === 0 ? (
                <Card className="p-8 text-center text-zinc-400">No paid orders yet today</Card>
              ) : (
                completedOrders.map((order) => (
                  <CompletedOrderRow key={order.id} order={order} />
                ))
              )}
            </div>
          </>
        )}

        {viewMode === "pending" && showTab("pending") && (
          <>
            <p className="text-sm text-zinc-400 mb-4">
              Served orders awaiting payment — pay full or split by item / share
            </p>
            {pendingOrders.length === 0 ? (
              <Card className="p-12 text-center">
                <Wallet className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-400">No pending payments. All served orders are paid.</p>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {pendingOrders.map((order) => (
                  <PendingPaymentCard
                    key={order.id}
                    order={order}
                    role={role!}
                    splitBillEnabled={Boolean(features.split_bill)}
                    onPaymentComplete={handlePaymentComplete}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {viewMode === "completed" && (
          <>
            <p className="text-sm text-zinc-400 mb-4">
              Today&apos;s completed orders — served and paid
            </p>
            {completedOrders.length === 0 ? (
              <Card className="p-12 text-center">
                <History className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-400">No completed orders yet today.</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {completedOrders.map((order) => (
                  <CompletedOrderRow key={order.id} order={order} />
                ))}
              </div>
            )}
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
                      role={role!}
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

        {viewMode === "offline" && (
          <OfflineOrderPanel onOrderPlaced={fetchData} />
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
                        : alert.type === "PAYMENT"
                          ? "border-emerald-500/30"
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
                                : alert.type === "PAYMENT"
                                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                  : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                            }
                          >
                            {alert.type === "OVERDUE"
                              ? "Overdue"
                              : alert.type === "PAYMENT"
                                ? "Payment"
                                : "Alarm"}
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
                        {alert.type === "PAYMENT" && showTab("pending") && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setViewMode("pending")}
                          >
                            View pending
                          </Button>
                        )}
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

      </main>
    </div>
  );
}

function ActiveOrderCard({
  order,
  now,
  role,
  onUpdate,
}: {
  order: Order;
  now: number;
  role: Role;
  onUpdate: (orderId: string, itemId: string, action: string) => void;
}) {
  const canStart = canPerformOrderAction(role, "prepare-item");
  const canReady = canPerformOrderAction(role, "ready-item");
  const canServe = canPerformOrderAction(role, "serve-item");
  const canReject = canPerformOrderAction(role, "reject-item");
  const canServeAll = canPerformOrderAction(role, "serve-all");

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
          {order.placedByName && (
            <p className="text-xs text-violet-400/80 mt-0.5">Placed by {order.placedByName}</p>
          )}
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
              {isOrderItemOpen(item.status) && (canStart || canReady || canServe || canReject) && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-1.5">
                    {canStart && item.status === "PENDING" && (
                      <Button size="sm" variant="secondary" className="flex-1 text-xs" onClick={() => onUpdate(order.id, item.id, "prepare-item")}>
                        Start
                      </Button>
                    )}
                    {canReady && (item.status === "PENDING" || item.status === "PREPARING") && (
                      <Button size="sm" variant="secondary" className="flex-1 text-xs" onClick={() => onUpdate(order.id, item.id, "ready-item")}>
                        Ready
                      </Button>
                    )}
                    {canServe && (
                      <Button size="sm" variant="success" className="flex-1 text-xs" onClick={() => onUpdate(order.id, item.id, "serve-item")}>
                        <CheckCircle2 className="w-3 h-3" /> Serve
                      </Button>
                    )}
                  </div>
                  {canReject && (
                    <Button
                      size="sm"
                      variant="danger"
                      className="w-full text-xs"
                      onClick={() => onUpdate(order.id, item.id, "reject-item")}
                    >
                      <Ban className="w-3 h-3" /> Out of stock / Can&apos;t serve
                    </Button>
                  )}
                </div>
              )}
              {item.status === "PREPARING" && item.preparedByName && (
                <span className="text-xs text-sky-400/80">Prep: {item.preparedByName}</span>
              )}
              {item.status === "READY" && item.readyByName && (
                <span className="text-xs text-amber-400/80">Ready: {item.readyByName}</span>
              )}
              {item.status === "SERVED" && (
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  {item.servedByName ? `Served by ${item.servedByName}` : "Served"}
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

      {canServeAll && (
        <Button variant="primary" size="sm" className="w-full" onClick={() => onUpdate(order.id, "", "serve-all")}>
          Mark All Served
        </Button>
      )}
    </motion.div>
  );
}

function PendingPaymentCard({
  order,
  role,
  splitBillEnabled,
  onPaymentComplete,
}: {
  order: Order;
  role: Role;
  splitBillEnabled: boolean;
  onPaymentComplete: (res: Response, json: { error?: string; receipt?: ReceiptPayload }) => Promise<void>;
}) {
  const summary = splitBillEnabled ? order.paymentSummary : null;
  const total = summary?.remaining ?? order.total ?? 0;
  const canPay = canPerformOrderAction(role, "mark-paid") || canPerformOrderAction(role, "record-payment");

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-5 backdrop-blur-xl"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <span className="text-2xl font-bold">T{order.table.number}</span>
          <p className="text-sm text-zinc-400">
            #{order.orderNumber}
            {order.customerName && ` · ${order.customerName}`}
          </p>
          {order.placedByName && (
            <p className="text-xs text-violet-400/80 mt-0.5">Placed by {order.placedByName}</p>
          )}
        </div>
        <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30">Awaiting payment</Badge>
      </div>

      <div className="space-y-1 mb-4">
        {(summary?.items ?? order.items.map((i) => ({
          id: i.id,
          itemName: i.itemName,
          quantity: i.quantity,
          status: i.status,
          remaining: i.status === "UNAVAILABLE" ? 0 : (i.unitPrice ?? 0) * i.quantity,
        }))).map((item) => {
          const servedByName = order.items.find((i) => i.id === item.id)?.servedByName;
          return (
          <div key={item.id} className="flex justify-between text-sm">
            <span className={item.status === "UNAVAILABLE" ? "text-zinc-500" : "text-zinc-300"}>
              {item.quantity}x {item.itemName}
              {servedByName && (
                <span className="text-zinc-500 ml-2">· {servedByName}</span>
              )}
            </span>
            <span className="text-zinc-400">{formatCurrency(item.remaining)}</span>
          </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between mb-4 pt-3 border-t border-white/10">
        <span className="text-sm text-zinc-400">Due now</span>
        <span className="text-lg font-bold text-yellow-400">{formatCurrency(total)}</span>
      </div>

      {canPay && summary && (
        <SplitPaymentPanel
          orderId={order.id}
          orderNumber={order.orderNumber}
          tableNumber={order.table.number}
          summary={summary}
          onPaymentComplete={onPaymentComplete}
        />
      )}
      {canPay && !summary && (
        <Button
          variant="success"
          size="sm"
          className="w-full bg-emerald-600 hover:bg-emerald-500"
          onClick={async () => {
            const res = await fetch(`/api/orders/${order.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "mark-paid", method: "UPI" }),
            });
            const json = await res.json().catch(() => ({}));
            await onPaymentComplete(res, json);
          }}
        >
          <CircleDollarSign className="w-4 h-4" /> Pay full {formatCurrency(total)}
        </Button>
      )}
    </motion.div>
  );
}

function CompletedOrderRow({ order }: { order: Order }) {
  const total =
    order.total ??
    sumOrderRevenue(
      order.items.map((i) => ({
        unitPrice: i.unitPrice ?? 0,
        quantity: i.quantity,
        status: i.status,
      }))
    );

  return (
    <Card className="p-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-lg font-bold">Table {order.table.number}</span>
            <span className="text-zinc-500">#{order.orderNumber}</span>
            <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
            {order.paidAt && (
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Paid</Badge>
            )}
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            {order.customerName && ` · ${order.customerName}`}
            {order.placedByName && ` · Placed by ${order.placedByName}`}
            {order.paidAt &&
              ` · Paid ${new Date(order.paidAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
            {order.paidByName && ` by ${order.paidByName}`}
          </p>
          <div className="space-y-1">
            {order.items.map((item) => {
              const lineTotal = orderItemLineTotal({
                unitPrice: item.unitPrice ?? 0,
                quantity: item.quantity,
                status: item.status,
              });
              return (
                <div key={item.id} className="flex justify-between text-sm gap-2">
                  <span
                    className={
                      item.status === "UNAVAILABLE" ? "text-zinc-500" : "text-zinc-300"
                    }
                  >
                    {item.quantity}x {item.itemName}
                    {item.status === "SERVED" && (
                      <span className="text-zinc-500 ml-2">
                        {item.servedByName ? `${item.servedByName}` : "served"}
                        {item.servedAt &&
                          ` ${new Date(item.servedAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}`}
                      </span>
                    )}
                    {item.status === "UNAVAILABLE" && (
                      <span className="text-amber-500/80 ml-2">not served — out of stock</span>
                    )}
                  </span>
                  {item.unitPrice !== undefined && (
                    <span
                      className={
                        item.status === "UNAVAILABLE"
                          ? "text-zinc-600 line-through shrink-0"
                          : "text-zinc-400 shrink-0"
                      }
                    >
                      {item.status === "UNAVAILABLE"
                        ? formatCurrency(0)
                        : formatCurrency(lineTotal)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="text-right sm:pl-4 sm:border-l sm:border-white/10">
          <p className="text-xs text-zinc-500">Bill total</p>
          <p className="text-xl font-bold text-emerald-400">{formatCurrency(total)}</p>
        </div>
      </div>
    </Card>
  );
}

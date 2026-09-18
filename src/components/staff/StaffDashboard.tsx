"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  ChefHat,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  LayoutDashboard,
  Utensils,
  TimerOff,
  X,
  Ban,
  Volume2,
  Wallet,
  CircleDollarSign,
  IndianRupee,
  ArrowRightLeft,
  ClipboardList,
  ShoppingBag,
  Truck,
  Plug,
} from "lucide-react";
import { Button, Badge, Card, Spinner } from "@/components/ui";
import { formatCurrency, formatCountdown, getStatusColor, cn, isOrderItemOpen, orderItemLineTotal, sumOrderRevenue } from "@/lib/utils";
import { gstBreakdownHintText } from "@/lib/revenue-audit";
import { fromPaise } from "@/lib/money";
import { canAccessTab, canMarkPickupReady, canPerformOrderAction, type StaffTab } from "@/lib/staff-permissions";
import type { Role } from "@/generated/prisma/client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useStaffNotifications } from "@/hooks/useStaffNotifications";
import { useStaffReadyAlerts } from "@/hooks/useStaffReadyAlerts";
import { TableOrderingPanel } from "@/components/staff/TableOrderingPanel";
import { SplitPaymentPanel } from "@/components/staff/SplitPaymentPanel";
import { AggregatorInboxBanner } from "@/components/staff/AggregatorInboxBanner";
import { RemoteOrdersPanel } from "@/components/staff/RemoteOrdersPanel";
import { TableOrdersTodayPanel } from "@/components/staff/TableOrdersTodayPanel";
import type { KitchenChitPayload } from "@/lib/kitchen-chit-service";
import { ThermalPrinterButton } from "@/components/staff/ThermalPrinterButton";
import { useThermalPrinter } from "@/hooks/useThermalPrinter";
import { canAccessAdminMenu, canManageTableOrdering, canPlaceOfflineOrder } from "@/lib/staff-permissions";
import { GuestRequestsPanel } from "@/components/staff/GuestRequestsPanel";
import { KitchenCapacityPanel } from "@/components/staff/KitchenCapacityPanel";
import { ServiceModeToggle } from "@/components/staff/ServiceModeToggle";
import { useStaffPush } from "@/hooks/useStaffPush";
import type { ReceiptPayload } from "@/lib/receipt-service";
import { isClientOffline, isNetworkFetchError, swallowPollingFetchError } from "@/lib/client-fetch";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { CookKitchenDashboard } from "@/components/staff/CookKitchenDashboard";
import { PickupQueuePanel } from "@/components/staff/PickupQueuePanel";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { takeOrderPath } from "@/lib/take-order-return";

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
  fulfillmentMode?: string;
  pickupCode?: string | null;
  status: string;
  alarmTriggered: boolean;
  paidAt?: string | null;
  collectedAt?: string | null;
  table: { number: number; assignedServerId?: string | null };
  items: OrderItem[];
  createdAt: string;
  total?: number;
  paidTotal?: number;
  itemSubtotal?: number;
  gstAmount?: number;
  gstInclusive?: boolean;
  pickup?: {
    outstandingAmountPaise?: number;
    paid?: boolean;
    foodReady?: boolean;
    collectable?: boolean;
    phase?: "AWAIT_PAYMENT" | "COOKING" | "HANDOVER" | "DONE";
  } | null;
  paymentSummary?: {
    total: number;
    paid: number;
    remaining: number;
    fullyPaid: boolean;
    itemSubtotal?: number;
    gstAmount?: number;
    gstInclusive?: boolean;
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
  placedByUserId?: string | null;
  paidByName?: string | null;
}

interface Alert {
  id: string;
  type: string;
  message: string;
  tableNumber: number;
  orderId?: string | null;
  isRead: boolean;
  createdAt: string;
  targetUserId?: string | null;
  categorySlug?: string | null;
}

interface Stats {
  activeOrders: number;
  pendingPayments: number;
  pendingPaymentsAmount: number;
  completedOrders: number;
  todayOrders: number;
  revenue: number;
  gstCollected?: number;
  gstCgstCollected?: number;
  gstSgstCollected?: number;
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
type OfflineIntent = "walkin" | "takeaway" | "delivery" | "aggregators";
type ItemFilter = "all" | "overdue" | "alarm";

function paymentMethodFromAlert(message: string): "CASH" | "UPI" {
  return /paid by UPI/i.test(message) ? "UPI" : "CASH";
}

type RestaurantFeatures = {
  kds?: boolean;
  floor_plan?: boolean;
  split_bill?: boolean;
  phone_orders?: boolean;
  aggregator_inbox?: boolean;
  thermal_receipts?: boolean;
  staff_performance?: boolean;
  gst_receipts?: boolean;
  inventory_86?: boolean;
  labor_clock?: boolean;
  reservations?: boolean;
  tip_pooling?: boolean;
  guest_crm?: boolean;
  audit_log?: boolean;
  promotions_engine?: boolean;
  menu_modifiers?: boolean;
  call_waiter?: boolean;
  kitchen_capacity?: boolean;
  payment_webhooks?: boolean;
  push_alerts?: boolean;
};

export function StaffDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<{
    id: string;
    name: string;
    role: Role;
    restaurantName: string;
    email?: string;
    restaurantLogoUrl?: string | null;
  } | null>(null);
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
  const searchParams = useSearchParams();
  const [viewMode, setViewMode] = useState<ViewMode>(
    searchParams.get("view") === "alerts" ? "alerts" : "active",
  );
  const [offlineIntent, setOfflineIntent] = useState<OfflineIntent>("walkin");
  const [itemFilter, setItemFilter] = useState<ItemFilter>("all");
  const [features, setFeatures] = useState<RestaurantFeatures>({});
  const [restaurantLogoUrl, setRestaurantLogoUrl] = useState<string | null>(null);

  const { alertsEnabled, showEnableBanner, enableAlerts, enabling, statusMessage } =
    useStaffNotifications(alerts, user?.id);
  useStaffReadyAlerts(orders, user?.id);
  const { registerPush } = useStaffPush(Boolean(features.push_alerts));
  const { printReceipt, autoPrint, kitchenChitPrint, supported: printerSupported, connect, deviceName, lastError, printing, status, toggleAutoPrint, toggleKitchenChitPrint, reprintOrderReceipt, printKitchenChit } = useThermalPrinter();
  const [printMessage, setPrintMessage] = useState<string | null>(null);
  const [tableOrdersRefreshKey, setTableOrdersRefreshKey] = useState(0);
  const [payingKey, setPayingKey] = useState<string | null>(null);
  const dashFailCountRef = useRef(0);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (searchParams.get("view") === "alerts") {
      setViewMode("alerts");
      return;
    }
    setViewMode((current) => (current === "alerts" ? "active" : current));
  }, [searchParams]);

  const goToView = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode);
      const alertsQuery = searchParams.get("view") === "alerts";
      if (mode === "alerts" && !alertsQuery) {
        router.replace("/staff/dashboard?view=alerts", { scroll: false });
      } else if (mode !== "alerts" && alertsQuery) {
        router.replace("/staff/dashboard", { scroll: false });
      }
    },
    [router, searchParams],
  );

  const fetchDashboard = useCallback(async (live = false) => {
    if (isClientOffline()) return;

    try {
      const dashRes = await fetch(live ? "/api/staff/dashboard?live=1" : "/api/staff/dashboard", {
        cache: "no-store",
      });
      if (dashRes.status === 401) {
        router.push("/");
        return;
      }
      if (!dashRes.ok) return;
      const data = await dashRes.json();
      setOrders(data.orders);
      setPendingOrders(data.pendingOrders ?? []);
      if (!data.live) {
        setCompletedOrders(data.completedOrders ?? []);
        setMissedTimeline(data.missedTimeline ?? []);
        setMissedSummary(data.missedSummary ?? []);
      }
      setAllowedTabs(data.permissions?.tabs ?? ["active"]);
      setAlerts(data.alerts);
      setTableSwitchRequests(data.tableSwitchRequests ?? []);
      setStats((prev) =>
        data.live && prev
          ? {
              ...prev,
              ...data.stats,
              completedOrders: prev.completedOrders,
              missedTimelineCount: prev.missedTimelineCount,
            }
          : data.stats,
      );
      setFeatures(data.features ?? {});
      setRestaurantLogoUrl(data.restaurant?.logoUrl ?? null);
      dashFailCountRef.current = 0;
    } catch (error) {
      if (isNetworkFetchError(error)) return;
      dashFailCountRef.current += 1;
      if (dashFailCountRef.current <= 2) {
        console.warn("Dashboard refresh unavailable — will retry automatically");
      }
    }
  }, [router]);

  const fetchData = useCallback(async () => {
    try {
      const meRes = await fetch("/api/auth/me");
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
      await fetchDashboard(false);
    } catch (error) {
      console.error("Dashboard fetch failed:", error);
    } finally {
      setLoading(false);
    }
  }, [router, fetchDashboard]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useLiveRefresh(() => fetchDashboard(true), {
    enabled: Boolean(user) && user?.role !== "COOK",
    intervalMs: 2000,
    streamUrl: "/api/live/stream",
  });

  const updateItem = async (orderId: string, itemId: string, action: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, itemId: itemId || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const due = fromPaise(json.outstandingAmountPaise ?? 0);
        const message =
          json.code === "PAYMENT_REQUIRED"
            ? json.error
              ? `${json.error}${due > 0 ? ` · ${formatCurrency(due)} due` : ""}`
              : `Payment required · ${formatCurrency(due)} due`
            : json.code === "NOT_READY"
              ? "Mark items Ready to collect first"
              : json.error || "Could not update order";
        alert(message);
        return;
      }
      await fetchData();
    } catch (error) {
      swallowPollingFetchError(error);
    }
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
    } catch (error) {
      swallowPollingFetchError(error);
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
      await fetchData();
      return;
    }

    await fetchData();

    if (printerSupported && autoPrint && json.receipt) {
      void (async () => {
        try {
          await printReceipt(json.receipt!);
          setPrintMessage("Receipt sent to printer.");
        } catch (error) {
          setPrintMessage(
            error instanceof Error ? error.message : "Payment saved, but receipt print failed.",
          );
        }
        window.setTimeout(() => setPrintMessage(null), 5000);
      })();
    }
  };

  const runPayment = async (key: string, action: () => Promise<void>) => {
    if (payingKey) return;
    setPayingKey(key);
    try {
      await action();
    } finally {
      setPayingKey(null);
    }
  };

  const handleRemoteOrderPlaced = async (result?: { kitchenChit?: KitchenChitPayload | null }) => {
    fetchData();
    setTableOrdersRefreshKey((key) => key + 1);
    if (printerSupported && kitchenChitPrint && result?.kitchenChit) {
      try {
        await printKitchenChit(result.kitchenChit);
        setPrintMessage("Kitchen chit sent to printer.");
      } catch (error) {
        setPrintMessage(
          error instanceof Error ? error.message : "Order saved, but kitchen chit print failed.",
        );
      }
      window.setTimeout(() => setPrintMessage(null), 5000);
    }
  };

  const handleReprintReceipt = async (orderId: string) => {
    try {
      await reprintOrderReceipt(orderId);
      setPrintMessage("Receipt reprinted.");
    } catch (error) {
      setPrintMessage(error instanceof Error ? error.message : "Reprint failed.");
    }
    window.setTimeout(() => setPrintMessage(null), 5000);
  };

  const dismissAlert = async (alertId: string) => {
    try {
      await fetch("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertIds: [alertId] }),
      });
      await fetchData();
    } catch (error) {
      swallowPollingFetchError(error);
    }
  };

  const openAlertsView = () => {
    goToView("alerts");
  };

  const confirmPaymentFromAlert = async (alert: Alert) => {
    const orderId =
      alert.orderId ||
      pendingOrders.find((order) => order.table.number === alert.tableNumber)?.id;
    if (!orderId) {
      goToView("pending");
      return;
    }
    const method = paymentMethodFromAlert(alert.message);
    await runPayment(`alert-${alert.id}`, async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mark-paid", method, payTab: true }),
        });
        const json = await res.json().catch(() => ({}));
        await handlePaymentComplete(res, json);
      } catch (error) {
        swallowPollingFetchError(error);
      }
    });
  };

  const dismissAlerts = async () => {
    try {
      await fetch("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      await fetchData();
    } catch (error) {
      swallowPollingFetchError(error);
    }
  };

  const pendingByTable = useMemo(() => {
    const groups = new Map<number, Order[]>();
    for (const order of pendingOrders) {
      const tableNumber = order.table.number;
      const list = groups.get(tableNumber) ?? [];
      list.push(order);
      groups.set(tableNumber, list);
    }
    return Array.from(groups.values()).sort(
      (a, b) => (a[0]?.table.number ?? 0) - (b[0]?.table.number ?? 0),
    );
  }, [pendingOrders]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-shell">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  if (user?.role === "COOK") {
    return (
      <CookKitchenDashboard
        user={{
          id: user.id,
          name: user.name,
          restaurantName: user.restaurantName,
        }}
        restaurantLogoUrl={restaurantLogoUrl}
        kdsEnabled={Boolean(features.kds)}
      />
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
    goToView("overdue");
    setItemFilter("overdue");
  };

  const role = user?.role;
  const showTab = (tab: StaffTab) => role && canAccessTab(role, tab) && allowedTabs.includes(tab);
  const paymentAlerts = alerts.filter((alert) => alert.type === "PAYMENT");
  const otherAlerts = alerts.filter((alert) => alert.type !== "PAYMENT");
  const canConfirmPayment = Boolean(role && canPerformOrderAction(role, "mark-paid"));

  return (
    <RestaurantShell
      wide
      title={viewMode === "alerts" ? "Notifications" : user?.restaurantName ?? "Restaurant"}
      subtitle={
        viewMode === "alerts"
          ? "Payment requests, overdue items, and customer alarms — confirm table payments in one click"
          : user
            ? `${user.name} · ${user.role.toLowerCase()}`
            : undefined
      }
      user={
        user
          ? { ...user, restaurantLogoUrl: restaurantLogoUrl ?? user.restaurantLogoUrl }
          : user
      }
      features={features}
      activeItem={viewMode === "alerts" ? "notifications" : "dashboard"}
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
            {!alertsEnabled && (
              <button
                type="button"
                onClick={async () => {
                  await enableAlerts();
                  if (features.push_alerts) await registerPush();
                }}
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
            {user && canPerformOrderAction(user.role, "mark-paid") && features.thermal_receipts && (
              <ThermalPrinterButton
                status={status}
                deviceName={deviceName}
                autoPrint={autoPrint}
                kitchenChitPrint={kitchenChitPrint}
                lastError={lastError}
                printing={printing}
                supported={printerSupported}
                onConnect={connect}
                onToggleAutoPrint={toggleAutoPrint}
                onToggleKitchenChitPrint={toggleKitchenChitPrint}
              />
            )}
        </div>
      }
    >
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
                onClick={async () => {
                  await enableAlerts();
                  if (features.push_alerts) await registerPush();
                }}
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
        {otherAlerts.length > 0 && (
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
                  {otherAlerts.length} alert{otherAlerts.length > 1 ? "s" : ""}
                </span>
                <span className="text-red-400/70 truncate hidden sm:inline">
                  — {otherAlerts[0]?.message}
                </span>
                <span className="text-xs text-red-300/80 sm:hidden">Tap to view</span>
              </div>
              <span className="text-xs text-red-300 shrink-0 ml-2 hidden sm:inline">View all →</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div>
        {printMessage && (
          <div className="mb-4 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
            {printMessage}
          </div>
        )}
        {paymentAlerts.length > 0 && viewMode !== "alerts" && (
          <div className="mb-4 space-y-2">
            {paymentAlerts.map((alert) => {
              const upi = paymentMethodFromAlert(alert.message) === "UPI";
              return (
                <div
                  key={alert.id}
                  className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-emerald-200">
                      Table {alert.tableNumber} · payment to confirm
                    </p>
                    <p className="text-sm text-emerald-100/80 truncate">{alert.message}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {canConfirmPayment ? (
                      <Button
                        size="sm"
                        variant="success"
                        className="bg-emerald-600 hover:bg-emerald-500"
                        disabled={Boolean(payingKey)}
                        onClick={() => void confirmPaymentFromAlert(alert)}
                      >
                        <CircleDollarSign className="w-3.5 h-3.5" />
                        {upi ? "Confirm UPI paid" : "Take cash"}
                      </Button>
                    ) : null}
                    <Button size="sm" variant="secondary" onClick={openAlertsView}>
                      Notifications
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex flex-col lg:flex-row lg:items-start gap-4 mb-6">
          <div className="min-w-0 flex-1 space-y-6">
        {user && canAccessAdminMenu(user.role) && <ServiceModeToggle />}
        <GuestRequestsPanel enabled={Boolean(features.call_waiter)} />

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
                  className="p-3 rounded-xl bg-black/20 border border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div>
                    <p className="font-medium text-foreground">
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
                onClick={() => { goToView("active"); setItemFilter("all"); }}
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
                onClick={() => goToView("pending")}
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
                    {stats.pendingPaymentsAmount > 0 && (
                      <p className="text-xs text-yellow-400/90">
                        {formatCurrency(stats.pendingPaymentsAmount)} due
                      </p>
                    )}
                  </div>
                </div>
              </button>
            )}

            {showTab("revenue") && (
              <button
                type="button"
                onClick={() => goToView("revenue")}
                className={cn(
                  "text-left rounded-2xl border p-4 transition-all",
                  viewMode === "revenue"
                    ? "border-emerald-500/50 bg-emerald-500/10"
                    : "border-white/10 bg-white/5 hover:border-white/20"
                )}
              >
                <div className="flex items-center gap-3">
                  <IndianRupee className="w-5 h-5 text-emerald-400" />
                  <div>
                    <p className="text-xs text-zinc-500">Revenue Today</p>
                    <p className="text-xl font-bold">{formatCurrency(stats.revenue)}</p>
                    <p className="text-xs text-emerald-400/90">
                      {stats.completedOrders} paid order{stats.completedOrders === 1 ? "" : "s"}
                    </p>
                    {(stats.gstCollected ?? 0) > 0 && (
                      <p className="text-[11px] text-amber-300/90 mt-0.5">
                        GST {formatCurrency(stats.gstCollected ?? 0)} collected
                      </p>
                    )}
                  </div>
                </div>
              </button>
            )}

            {showTab("overdue") && (
              <button
                type="button"
                onClick={() => {
                  goToView("overdue");
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
                onClick={() => goToView("missed")}
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

            {showTab("tables_today") && (
              <button
                type="button"
                onClick={() => goToView("tables_today")}
                className={cn(
                  "text-left rounded-2xl border p-4 transition-all",
                  viewMode === "tables_today"
                    ? "border-cyan-500/50 bg-cyan-500/10"
                    : "border-white/10 bg-white/5 hover:border-white/20"
                )}
              >
                <div className="flex items-center gap-3">
                  <ClipboardList className="w-5 h-5 text-cyan-400" />
                  <div>
                    <p className="text-xs text-zinc-500">Table orders</p>
                    <p className="text-sm font-semibold text-cyan-200">Today by table</p>
                  </div>
                </div>
              </button>
            )}

          </div>
        )}

        {showTab("offline") && user && canPlaceOfflineOrder(user.role) && (
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => router.push(takeOrderPath("/staff/dashboard", "walkin"))}
              className="text-left rounded-2xl border p-3 transition-all border-white/10 bg-white/5 hover:border-white/20"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Utensils className="w-4 h-4 text-violet-800 dark:text-violet-300 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted">Walk-in / table</p>
                  <p className="text-sm font-semibold text-foreground">Dine-in order</p>
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => router.push(takeOrderPath("/staff/dashboard", "takeaway"))}
              className="text-left rounded-2xl border p-3 transition-all border-white/10 bg-white/5 hover:border-white/20"
            >
              <div className="flex items-center gap-2 min-w-0">
                <ShoppingBag className="w-4 h-4 text-orange-800 dark:text-orange-300 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted">Takeaway</p>
                  <p className="text-sm font-semibold text-foreground">Pack & collect</p>
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => router.push(takeOrderPath("/staff/dashboard", "delivery"))}
              className="text-left rounded-2xl border p-3 transition-all border-white/10 bg-white/5 hover:border-white/20"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Truck className="w-4 h-4 text-sky-800 dark:text-sky-300 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted">Delivery</p>
                  <p className="text-sm font-semibold text-foreground">Send out</p>
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setOfflineIntent("aggregators");
                goToView("offline");
              }}
              className={cn(
                "text-left rounded-2xl border p-3 transition-all",
                viewMode === "offline" && offlineIntent === "aggregators"
                  ? "border-orange-500/50 bg-orange-500/10"
                  : "border-white/10 bg-white/5 hover:border-white/20",
              )}
            >
              <div className="flex items-center gap-2">
                <Plug className="w-4 h-4 text-orange-800 dark:text-orange-300 shrink-0" />
                <div>
                  <p className="text-xs text-muted">Swiggy / Zomato</p>
                  <p className="text-sm font-semibold text-foreground">Aggregator</p>
                </div>
              </div>
            </button>
          </div>
        )}

        {viewMode === "active" && (
          <>
            <div className="mb-6">
              <PickupQueuePanel
                canCollect={canPerformOrderAction(role!, "collect-order")}
                canReady={canMarkPickupReady(role!)}
                canPay={canPerformOrderAction(role!, "mark-paid") || canPerformOrderAction(role!, "record-payment")}
                payingKey={payingKey}
                onCollected={() => void fetchDashboard()}
                onPay={(orderId, method) => {
                  void runPayment(`pickup-queue-${orderId}`, async () => {
                    try {
                      const res = await fetch(`/api/orders/${orderId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "mark-paid", method }),
                      });
                      const json = await res.json().catch(() => ({}));
                      await handlePaymentComplete(res, json);
                    } catch (error) {
                      swallowPollingFetchError(error);
                    }
                  });
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
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
                    onClick={() => router.push(takeOrderPath("/staff/dashboard", "walkin"))}
                    className="text-sm text-violet-800 dark:text-violet-400 hover:text-violet-900 dark:hover:text-violet-300 mr-4"
                  >
                    Take a walk-in order →
                  </button>
                )}
                {showTab("pending") && (
                <button
                  onClick={() => goToView("pending")}
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
                    payingKey={payingKey}
                    onUpdate={updateItem}
                    onPay={(orderId, method) => {
                      void runPayment(`pickup-active-${orderId}`, async () => {
                        try {
                          const res = await fetch(`/api/orders/${orderId}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "mark-paid", method }),
                          });
                          const json = await res.json().catch(() => ({}));
                          await handlePaymentComplete(res, json);
                        } catch (error) {
                          swallowPollingFetchError(error);
                        }
                      });
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {viewMode === "revenue" && showTab("revenue") && (
          <>
            <p className="text-sm text-zinc-400 mb-4">
              Today&apos;s collected payments — the amount actually taken, including GST when it is added on top of menu prices
            </p>
            <Card className="p-5 mb-4">
              <p className="text-sm text-zinc-500">Total collected</p>
              <p className="text-3xl font-bold text-emerald-400">{formatCurrency(stats?.revenue ?? 0)}</p>
              <p className="text-xs text-zinc-500 mt-1">
                {stats?.completedOrders ?? 0} paid order{(stats?.completedOrders ?? 0) === 1 ? "" : "s"} today
              </p>
              {(stats?.gstCollected ?? 0) > 0 && (
                <div className="mt-4 pt-3 border-t border-white/10">
                  <p className="text-xs text-zinc-500">GST collected today</p>
                  <p className="text-lg font-semibold text-amber-300">{formatCurrency(stats?.gstCollected ?? 0)}</p>
                  {(stats?.gstCgstCollected ?? 0) > 0 && (
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      CGST {formatCurrency(stats?.gstCgstCollected ?? 0)} · SGST {formatCurrency(stats?.gstSgstCollected ?? 0)}
                    </p>
                  )}
                </div>
              )}
            </Card>
            <div className="space-y-3">
              {completedOrders.length === 0 ? (
                <Card className="p-8 text-center text-zinc-400">No paid orders yet today</Card>
              ) : (
                completedOrders.map((order) => (
                  <CompletedOrderRow
                    key={order.id}
                    order={order}
                    canReprint={Boolean(features.thermal_receipts)}
                    onReprint={handleReprintReceipt}
                  />
                ))
              )}
            </div>
          </>
        )}

        {viewMode === "pending" && showTab("pending") && (
          <>
            <p className="text-sm text-zinc-400 mb-4">
              Served orders awaiting payment — multiple rounds on the same table are combined until paid
              {stats?.pendingPaymentsAmount ? (
                <>
                  {" "}
                  · <span className="text-yellow-400">{formatCurrency(stats.pendingPaymentsAmount)} total due</span>
                </>
              ) : null}
            </p>
            {pendingOrders.length === 0 ? (
              <Card className="p-12 text-center">
                <Wallet className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-400">No pending payments. All served orders are paid.</p>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {pendingByTable.map((tableOrders) =>
                  tableOrders.length > 1 ? (
                    <TableTabPendingCard
                      key={`tab-${tableOrders[0]!.table.number}`}
                      orders={tableOrders}
                      role={role!}
                      payingKey={payingKey}
                      onPaymentComplete={handlePaymentComplete}
                      runPayment={runPayment}
                    />
                  ) : (
                    <PendingPaymentCard
                      key={tableOrders[0]!.id}
                      order={tableOrders[0]!}
                      role={role!}
                      splitBillEnabled={Boolean(features.split_bill)}
                      payingKey={payingKey}
                      onPaymentComplete={handlePaymentComplete}
                      runPayment={runPayment}
                    />
                  ),
                )}
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
                      payingKey={payingKey}
                      onUpdate={updateItem}
                      onPay={(orderId, method) => {
                        void runPayment(`pickup-overdue-${orderId}`, async () => {
                          try {
                            const res = await fetch(`/api/orders/${orderId}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ action: "mark-paid", method }),
                            });
                            const json = await res.json().catch(() => ({}));
                            await handlePaymentComplete(res, json);
                          } catch (error) {
                            swallowPollingFetchError(error);
                          }
                        });
                      }}
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

        {viewMode === "tables_today" && (
          <TableOrdersTodayPanel refreshKey={tableOrdersRefreshKey} />
        )}

        {viewMode === "offline" && (
          <div className="space-y-5">
            {offlineIntent === "aggregators" ? (
              features.aggregator_inbox ? (
                <AggregatorInboxBanner />
              ) : (
                <div className="rounded-2xl border border-orange-500/25 bg-orange-500/5 p-4">
                  <p className="font-medium text-orange-800 dark:text-orange-100">Swiggy & Zomato</p>
                  <p className="text-sm text-muted mt-1">
                    Connect outlets from Admin → Integrations. Incoming orders then appear on the kitchen board automatically.
                  </p>
                  <Link
                    href="/admin/integrations"
                    className="inline-flex items-center gap-2 mt-3 text-sm text-orange-800 dark:text-orange-300"
                  >
                    <Plug className="w-4 h-4" /> Open integrations
                  </Link>
                </div>
              )
            ) : (
              <RemoteOrdersPanel
                key={offlineIntent}
                initialMode={offlineIntent}
                onOrderPlaced={handleRemoteOrderPlaced}
              />
            )}
          </div>
        )}

        {viewMode === "alerts" && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <p className="text-sm text-zinc-400">
                Notifications — payment requests, overdue items, and customer alarms. Confirm table payments here in one click.
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
                        <p className="font-medium text-foreground">{alert.message}</p>
                        <p className="text-xs text-zinc-500 mt-1">
                          {new Date(alert.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        {alert.type === "PAYMENT" &&
                          showTab("pending") &&
                          canPerformOrderAction(role!, "mark-paid") &&
                          alert.orderId && (
                            <Button
                              size="sm"
                              variant="success"
                              className="bg-emerald-600 hover:bg-emerald-500"
                              disabled={Boolean(payingKey)}
                              onClick={() => void confirmPaymentFromAlert(alert)}
                            >
                              <CircleDollarSign className="w-3.5 h-3.5" />
                              {paymentMethodFromAlert(alert.message) === "UPI"
                                ? "Confirm UPI paid"
                                : "Take cash"}
                            </Button>
                          )}
                        {alert.type === "PAYMENT" && showTab("pending") && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => goToView("pending")}
                          >
                            View bill
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
          </div>

          {(user && canManageTableOrdering(user.role)) || features.kitchen_capacity ? (
            <aside className="lg:w-72 xl:w-80 shrink-0 space-y-3 lg:sticky lg:top-4">
              <KitchenCapacityPanel compact enabled={Boolean(features.kitchen_capacity)} />
              {user && canManageTableOrdering(user.role) && <TableOrderingPanel compact />}
            </aside>
          ) : null}
        </div>
      </div>
    </RestaurantShell>
  );
}

function ActiveOrderCard({
  order,
  now,
  role,
  payingKey,
  onUpdate,
  onPay,
}: {
  order: Order;
  now: number;
  role: Role;
  payingKey: string | null;
  onUpdate: (orderId: string, itemId: string, action: string) => void;
  onPay: (orderId: string, method: "CASH" | "UPI") => void;
}) {
  const isPickup = order.fulfillmentMode === "SELF_PICKUP";
  const canStart = canPerformOrderAction(role, "prepare-item");
  const canReady = isPickup ? canMarkPickupReady(role) : canPerformOrderAction(role, "ready-item");
  const canServe = canPerformOrderAction(role, "serve-item");
  const canReject = canPerformOrderAction(role, "reject-item");
  const canServeAll = canPerformOrderAction(role, "serve-all");
  const canCollect = canPerformOrderAction(role, "collect-order");
  const canPay = canPerformOrderAction(role, "mark-paid") || canPerformOrderAction(role, "record-payment");
  const requiredItems = order.items.filter((item) => item.status !== "UNAVAILABLE");
  const needsReady = requiredItems.some((item) => item.status === "PENDING" || item.status === "PREPARING");
  const foodReady =
    order.pickup?.foodReady ??
    (requiredItems.length > 0 &&
      requiredItems.every((item) => item.status === "READY" || item.status === "SERVED"));
  const paid =
    order.pickup?.paid ??
    (order.paymentSummary ? order.paymentSummary.remaining <= 0.01 : Boolean(order.paidAt));
  const due = order.pickup?.outstandingAmountPaise != null
    ? fromPaise(order.pickup.outstandingAmountPaise)
    : order.paymentSummary?.remaining ?? 0;
  const collectable = order.pickup?.collectable ?? (foodReady && paid);
  const kitchenReleased = !isPickup || paid;

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
            {order.fulfillmentMode === "SELF_PICKUP" ? " · SELF PICKUP" : ""}
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
              {isOrderItemOpen(item.status) && kitchenReleased && (canStart || canReady || (!isPickup && canServe) || canReject) && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-1.5">
                    {canStart && item.status === "PENDING" && (
                      <Button size="sm" variant="secondary" className="flex-1 text-xs" onClick={() => onUpdate(order.id, item.id, "prepare-item")}>
                        Start
                      </Button>
                    )}
                    {canReady && (item.status === "PENDING" || item.status === "PREPARING") && (
                      <Button size="sm" variant="secondary" className="flex-1 text-xs" onClick={() => onUpdate(order.id, item.id, "ready-item")}>
                        {isPickup ? "Ready to collect" : "Ready"}
                      </Button>
                    )}
                    {!isPickup && canServe && item.status === "READY" && (
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
              {item.status === "READY" && (
                <span className="text-xs text-amber-400/80">
                  {isPickup
                    ? item.readyByName
                      ? `Ready to collect · ${item.readyByName}`
                      : "Ready to collect"
                    : item.readyByName
                      ? `Ready: ${item.readyByName}`
                      : "Ready"}
                </span>
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

      {isPickup ? (
        <div className="space-y-2">
          {!paid && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
              <p className="text-sm font-semibold text-amber-200">Pay first — kitchen starts after payment</p>
              <p className="text-xs text-amber-100/80">
                Due {formatCurrency(due)}. Owner, manager, or server can take cash or mark online paid.
              </p>
              <GstBreakdownNote
                itemSubtotal={order.paymentSummary?.itemSubtotal ?? order.itemSubtotal}
                gstAmount={order.paymentSummary?.gstAmount ?? order.gstAmount}
                gstInclusive={order.paymentSummary?.gstInclusive ?? order.gstInclusive}
                className="text-amber-100/80"
              />
              {canPay ? (
                <div className="flex gap-2">
                  <Button
                    variant="success"
                    size="sm"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500"
                    disabled={Boolean(payingKey)}
                    onClick={() => onPay(order.id, "CASH")}
                  >
                    Take cash · {formatCurrency(due)}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    disabled={Boolean(payingKey)}
                    onClick={() => onPay(order.id, "UPI")}
                  >
                    Mark UPI paid
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-zinc-400">Ask an owner, manager, or server to take payment.</p>
              )}
            </div>
          )}
          {canReady && needsReady && kitchenReleased && (
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => onUpdate(order.id, "", "ready-all")}
            >
              Ready to collect
            </Button>
          )}
          {canCollect && (
            <Button
              variant="primary"
              size="sm"
              className="w-full"
              disabled={!collectable}
              onClick={() => onUpdate(order.id, "", "collect-order")}
            >
              Mark Collected
            </Button>
          )}
          {canCollect && !collectable && (
            <p className="text-xs text-amber-300 text-center">
              {!paid
                ? "Take payment first. The kitchen ticket prints after this order is paid."
                : "Mark items ready to collect first."}
            </p>
          )}
        </div>
      ) : (
        canServeAll && (
          <Button
            variant="primary"
            size="sm"
            className="w-full"
            onClick={() => onUpdate(order.id, "", "serve-all")}
          >
            Mark All Served
          </Button>
        )
      )}
    </motion.div>
  );
}

function TableTabPendingCard({
  orders,
  role,
  payingKey,
  onPaymentComplete,
  runPayment,
}: {
  orders: Order[];
  role: Role;
  payingKey: string | null;
  onPaymentComplete: (res: Response, json: { error?: string; receipt?: ReceiptPayload }) => Promise<void>;
  runPayment: (key: string, action: () => Promise<void>) => Promise<void>;
}) {
  const anchor = orders[0]!;
  const total = orders.reduce(
    (sum, order) => sum + (order.paymentSummary?.remaining ?? order.total ?? 0),
    0,
  );
  const itemSubtotal = orders.reduce(
    (sum, order) => sum + (order.paymentSummary?.itemSubtotal ?? order.itemSubtotal ?? 0),
    0,
  );
  const gstAmount = orders.reduce(
    (sum, order) => sum + (order.paymentSummary?.gstAmount ?? order.gstAmount ?? 0),
    0,
  );
  const gstInclusive = orders.every(
    (order) => (order.paymentSummary?.gstInclusive ?? order.gstInclusive) !== false,
  );
  const canPay = canPerformOrderAction(role, "mark-paid") || canPerformOrderAction(role, "record-payment");
  const tableKey = `tab-${anchor.table.number}`;

  const payOrder = (orderId: string, payTab: boolean, method: "CASH" | "UPI") => {
    void runPayment(`${tableKey}-${orderId}-${method}`, async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mark-paid", method, ...(payTab ? { payTab: true } : {}) }),
        });
        const json = await res.json().catch(() => ({}));
        await onPaymentComplete(res, json);
      } catch (error) {
        swallowPollingFetchError(error);
      }
    });
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-5 backdrop-blur-xl md:col-span-2"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <span className="text-2xl font-bold">T{anchor.table.number}</span>
          <p className="text-sm text-zinc-400">
            Combined table bill · {orders.length} orders
          </p>
        </div>
        <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30">Awaiting payment</Badge>
      </div>

      <div className="space-y-3 mb-4">
        {orders.map((order) => {
          const due = order.paymentSummary?.remaining ?? order.total ?? 0;
          return (
          <div key={order.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-xs text-zinc-500">
                Order #{order.orderNumber}
                {order.customerName ? ` · ${order.customerName}` : ""}
                {order.placedByName ? ` · staff: ${order.placedByName}` : ""}
              </p>
              {canPay && due > 0.01 && orders.length > 1 && (
                <Button
                  variant="success"
                  size="sm"
                  className="shrink-0 bg-emerald-600 hover:bg-emerald-500 text-xs px-2 py-1 h-auto"
                  disabled={Boolean(payingKey)}
                  onClick={() => payOrder(order.id, false, "UPI")}
                >
                  Pay {formatCurrency(due)}
                </Button>
              )}
            </div>
            <div className="space-y-1">
              {order.items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className={item.status === "UNAVAILABLE" ? "text-zinc-500" : "text-zinc-300"}>
                    {item.quantity}x {item.itemName}
                  </span>
                  <span className="text-zinc-400">
                    {formatCurrency(
                      item.status === "UNAVAILABLE" ? 0 : (item.unitPrice ?? 0) * item.quantity,
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-white/10">
        <span className="text-sm text-zinc-400">Table total due</span>
        <span className="text-lg font-bold text-yellow-400">{formatCurrency(total)}</span>
      </div>
      <div className="flex justify-end mb-4">
        <GstBreakdownNote itemSubtotal={itemSubtotal} gstAmount={gstAmount} gstInclusive={gstInclusive} />
      </div>

      {canPay && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="success"
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500"
            disabled={Boolean(payingKey) || total <= 0.01}
            onClick={() => payOrder(anchor.id, true, "CASH")}
          >
            Take cash · {formatCurrency(total)}
          </Button>
          <Button
            variant="success"
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500"
            disabled={Boolean(payingKey) || total <= 0.01}
            onClick={() => payOrder(anchor.id, true, "UPI")}
          >
            Confirm UPI · {formatCurrency(total)}
          </Button>
        </div>
      )}
    </motion.div>
  );
}

function PendingPaymentCard({
  order,
  role,
  splitBillEnabled,
  payingKey,
  onPaymentComplete,
  runPayment,
}: {
  order: Order;
  role: Role;
  splitBillEnabled: boolean;
  payingKey: string | null;
  onPaymentComplete: (res: Response, json: { error?: string; receipt?: ReceiptPayload }) => Promise<void>;
  runPayment: (key: string, action: () => Promise<void>) => Promise<void>;
}) {
  const summary = order.paymentSummary;
  const total = summary?.remaining ?? order.total ?? 0;
  const canPay = canPerformOrderAction(role, "mark-paid") || canPerformOrderAction(role, "record-payment");
  const paymentKey = `order-${order.id}`;

  const payFull = (method: "CASH" | "UPI") => {
    void runPayment(`${paymentKey}-${method}`, async () => {
      try {
        const res = await fetch(`/api/orders/${order.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mark-paid", method, payTab: true }),
        });
        const json = await res.json().catch(() => ({}));
        await onPaymentComplete(res, json);
      } catch (error) {
        swallowPollingFetchError(error);
      }
    });
  };

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

      <div className="flex items-center justify-between pt-3 border-t border-white/10">
        <span className="text-sm text-zinc-400">Due now</span>
        <span className="text-lg font-bold text-yellow-400">{formatCurrency(total)}</span>
      </div>
      <div className="flex justify-end mb-4">
        <GstBreakdownNote
          itemSubtotal={summary?.itemSubtotal ?? order.itemSubtotal}
          gstAmount={summary?.gstAmount ?? order.gstAmount}
          gstInclusive={summary?.gstInclusive ?? order.gstInclusive}
        />
      </div>

      {canPay && summary && splitBillEnabled && (
        <SplitPaymentPanel
          orderId={order.id}
          orderNumber={order.orderNumber}
          tableNumber={order.table.number}
          summary={summary}
          disabled={Boolean(payingKey)}
          onPaymentComplete={onPaymentComplete}
          runPayment={runPayment}
        />
      )}
      {canPay && (!splitBillEnabled || !summary) && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="success"
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500"
            disabled={Boolean(payingKey) || total <= 0.01}
            onClick={() => payFull("CASH")}
          >
            Take cash
          </Button>
          <Button
            variant="success"
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500"
            disabled={Boolean(payingKey) || total <= 0.01}
            onClick={() => payFull("UPI")}
          >
            Confirm UPI
          </Button>
        </div>
      )}
    </motion.div>
  );
}

function GstBreakdownNote({
  itemSubtotal,
  gstAmount,
  gstInclusive,
  className,
}: {
  itemSubtotal?: number;
  gstAmount?: number;
  gstInclusive?: boolean;
  className?: string;
}) {
  const text = gstBreakdownHintText({
    itemSubtotal: itemSubtotal ?? 0,
    gstAmount: gstAmount ?? 0,
    gstInclusive,
  });
  if (!text) return null;
  return <p className={cn("text-[11px] leading-tight text-zinc-500", className)}>{text}</p>;
}

function CompletedOrderRow({
  order,
  canReprint,
  onReprint,
}: {
  order: Order;
  canReprint?: boolean;
  onReprint?: (orderId: string) => void;
}) {
  const total =
    order.total ??
    sumOrderRevenue(
      order.items.map((i) => ({
        unitPrice: i.unitPrice ?? 0,
        quantity: i.quantity,
        status: i.status,
      })),
    );
  const itemSubtotal =
    order.itemSubtotal ??
    sumOrderRevenue(
      order.items.map((i) => ({
        unitPrice: i.unitPrice ?? 0,
        quantity: i.quantity,
        status: i.status,
      })),
    );

  return (
    <Card className="p-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
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
                    className={item.status === "UNAVAILABLE" ? "text-zinc-500" : "text-zinc-300"}
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
        <div className="text-right sm:pl-4 sm:border-l sm:border-white/10 space-y-2">
          <p className="text-xs text-zinc-500">Collected</p>
          <p className="text-xl font-bold text-emerald-400">{formatCurrency(total)}</p>
          <GstBreakdownNote
            itemSubtotal={itemSubtotal}
            gstAmount={order.gstAmount}
            gstInclusive={order.gstInclusive}
            className="sm:text-right"
          />
          {canReprint && order.paidAt && onReprint && (
            <Button
              size="sm"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => void onReprint(order.id)}
            >
              Reprint receipt
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

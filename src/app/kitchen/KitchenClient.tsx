"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ChefHat,
  LogOut,
  RefreshCw,
  LayoutDashboard,
  AlertTriangle,
  Ban,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Badge, Spinner } from "@/components/ui";
import { cn, formatCountdown } from "@/lib/utils";
import { isClientOffline, swallowPollingFetchError } from "@/lib/client-fetch";

type KitchenItem = {
  id: string;
  itemName: string;
  quantity: number;
  status: string;
  notes?: string | null;
  expectedReadyAt: string;
  isOverdue: boolean;
  categoryName: string;
  categorySlug: string;
};

const KDS_CATEGORY_FILTER_KEY = "kds-category-filter";

function loadSavedCategoryFilter(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(KDS_CATEGORY_FILTER_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

type KitchenTicket = {
  id: string;
  orderNumber: number;
  tableNumber: number;
  locationLabel?: string;
  orderChannel?: string;
  customerName: string | null;
  alarmTriggered: boolean;
  items: KitchenItem[];
};

type Station = {
  id: string;
  name: string;
  slug: string;
  color: string;
};

export default function KitchenClient() {
  const router = useRouter();
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedCategorySlugs, setSelectedCategorySlugs] = useState<Set<string>>(
    () => loadSavedCategoryFilter(),
  );
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [role, setRole] = useState<string>("COOK");

  const loadKitchen = useCallback(async () => {
    if (isClientOffline()) return;
    try {
      const dataRes = await fetch("/api/kitchen/orders?station=all", { cache: "no-store" });
      if (dataRes.ok) {
        const data = await dataRes.json();
        setStations(data.stations ?? []);
        setTickets(data.tickets ?? []);
      }
    } catch (error) {
      swallowPollingFetchError(error);
    }
  }, []);

  const toggleCategoryFilter = (slug: string) => {
    setSelectedCategorySlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      localStorage.setItem(KDS_CATEGORY_FILTER_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const clearCategoryFilter = () => {
    setSelectedCategorySlugs(new Set());
    localStorage.removeItem(KDS_CATEGORY_FILTER_KEY);
  };

  const matchesCategoryFilter = useCallback(
    (categorySlug: string) =>
      selectedCategorySlugs.size === 0 || selectedCategorySlugs.has(categorySlug),
    [selectedCategorySlugs],
  );

  const load = useCallback(async () => {
    try {
      const meRes = await fetch("/api/auth/me");
      if (meRes.ok) {
        const me = await meRes.json();
        setRole(me.user?.role ?? "COOK");
      }
      await loadKitchen();
    } catch (error) {
      swallowPollingFetchError(error);
    } finally {
      setLoading(false);
    }
  }, [loadKitchen]);

  useEffect(() => {
    void load();
    const poll = setInterval(() => {
      if (document.hidden) return;
      void loadKitchen();
    }, 6000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const onVisible = () => {
      if (!document.hidden) void loadKitchen();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, loadKitchen]);

  const updateItem = async (orderId: string, itemId: string, action: string) => {
    try {
      await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, itemId }),
      });
      await loadKitchen();
    } catch (error) {
      swallowPollingFetchError(error);
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (error) {
      swallowPollingFetchError(error);
    }
    router.push("/");
  };

  const columns = [
    { key: "PENDING", label: "New", color: "border-amber-500/40" },
    { key: "PREPARING", label: "Cooking", color: "border-blue-500/40" },
    { key: "READY", label: "Ready to bump", color: "border-emerald-500/40" },
  ] as const;

  if (loading) {
    return (
      <div className="min-h-screen bg-app-shell flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app-shell text-foreground">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-app-shell/95 backdrop-blur-xl px-4 py-3">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/staff/dashboard"
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300"
              title="Back to dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <ChefHat className="w-6 h-6 text-orange-400" />
            <div>
              <h1 className="text-lg font-bold">Kitchen Display</h1>
              <p className="text-xs text-zinc-500">
                {selectedCategorySlugs.size === 0
                  ? "Showing all categories · tap to filter"
                  : `${selectedCategorySlugs.size} categor${selectedCategorySlugs.size === 1 ? "y" : "ies"} selected`}
              </p>
            </div>
          </div>
          <div className="header-trailing-actions flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={clearCategoryFilter}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm border transition-colors",
                  selectedCategorySlugs.size === 0
                    ? "bg-white/10 border-white/20 text-foreground"
                    : "border-white/5 text-zinc-400 hover:text-white",
                )}
              >
                All
              </button>
              {stations.map((station) => {
                const isSelected = selectedCategorySlugs.has(station.slug);
                return (
                  <button
                    key={station.id}
                    type="button"
                    onClick={() => toggleCategoryFilter(station.slug)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm border transition-colors",
                      isSelected
                        ? "text-white border-white/20"
                        : "border-white/5 text-zinc-400 hover:text-white",
                    )}
                    style={
                      isSelected
                        ? { backgroundColor: `${station.color}33`, borderColor: `${station.color}66` }
                        : undefined
                    }
                    aria-pressed={isSelected}
                  >
                    {station.name}
                  </button>
                );
              })}
            </div>
            <Button variant="secondary" size="sm" onClick={load}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            {(role === "OWNER" || role === "MANAGER") && (
              <Link href="/staff/dashboard">
                <Button variant="secondary" size="sm">
                  <LayoutDashboard className="w-4 h-4" /> Dashboard
                </Button>
              </Link>
            )}
            <Button variant="secondary" size="sm" onClick={logout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {columns.map((col) => {
            const colItems = tickets.flatMap((ticket) =>
              ticket.items
                .filter(
                  (item) =>
                    item.status === col.key && matchesCategoryFilter(item.categorySlug),
                )
                .map((item) => ({ ticket, item })),
            );
            return (
              <section key={col.key} className={cn("rounded-2xl border bg-white/[0.02] p-4", col.color)}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-lg">{col.label}</h2>
                  <Badge className="bg-white/10 text-zinc-300">{colItems.length}</Badge>
                </div>
                <div className="space-y-3 min-h-[200px]">
                  {colItems.length === 0 && (
                    <p className="text-sm text-zinc-600 text-center py-8">No tickets</p>
                  )}
                  {colItems.map(({ ticket, item }) => {
                    const remaining = Math.max(
                      0,
                      Math.floor((new Date(item.expectedReadyAt).getTime() - now) / 1000),
                    );
                    return (
                      <motion.div
                        key={item.id}
                        layout
                        className={cn(
                          "rounded-xl border p-4",
                          item.isOverdue
                            ? "border-red-500/40 bg-red-500/10"
                            : ticket.alarmTriggered
                              ? "border-red-500/30 bg-red-500/5 animate-pulse"
                              : "border-white/10 bg-white/5",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <span className="text-2xl font-black">
                              {ticket.locationLabel ?? `T${ticket.tableNumber}`}
                            </span>
                            <span className="text-zinc-500 text-sm ml-2">#{ticket.orderNumber}</span>
                          </div>
                          <span
                            className={cn(
                              "text-xs font-mono",
                              item.isOverdue ? "text-red-400" : "text-zinc-500",
                            )}
                          >
                            {item.isOverdue
                              ? "OVERDUE"
                              : remaining > 0
                                ? formatCountdown(remaining)
                                : "Due now"}
                          </span>
                        </div>
                        <p className="font-semibold text-lg leading-tight">
                          {item.quantity}x {item.itemName}
                        </p>
                        <p className="text-xs text-zinc-500 mt-1">{item.categoryName}</p>
                        {item.notes && (
                          <p className="text-sm text-amber-300 mt-2 bg-amber-500/10 rounded-lg px-2 py-1">
                            Note: {item.notes}
                          </p>
                        )}
                        {ticket.alarmTriggered && (
                          <div className="flex items-center gap-1 text-xs text-red-400 mt-2">
                            <AlertTriangle className="w-3 h-3" /> Table needs help
                          </div>
                        )}
                        <div className="flex gap-2 mt-3">
                          {col.key === "PENDING" && (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="flex-1 text-xs"
                              onClick={() => updateItem(ticket.id, item.id, "prepare-item")}
                            >
                              Start
                            </Button>
                          )}
                          {(col.key === "PENDING" || col.key === "PREPARING") && (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="flex-1 text-xs"
                              onClick={() => updateItem(ticket.id, item.id, "ready-item")}
                            >
                              Ready
                            </Button>
                          )}
                          {col.key === "READY" && (
                            <span className="text-xs text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Waiting for server
                            </span>
                          )}
                          <Button
                            size="sm"
                            variant="danger"
                            className="text-xs"
                            onClick={() => updateItem(ticket.id, item.id, "reject-item")}
                          >
                            <Ban className="w-3 h-3" />
                          </Button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { ChefHat, LogOut, RefreshCw, Volume2, AlertTriangle } from "lucide-react";
import { Button, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { isClientOffline, swallowPollingFetchError } from "@/lib/client-fetch";
import { useKitchenTicketAlerts } from "@/hooks/useKitchenTicketAlerts";
import { useStaffNotifications, type StaffAlertItem } from "@/hooks/useStaffNotifications";
import {
  KitchenTicketBoard,
  type KitchenBoardTicket,
} from "@/components/kitchen/KitchenTicketBoard";

type Station = {
  id: string;
  name: string;
  slug: string;
  color: string;
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

type CookKitchenDashboardProps = {
  user: { id: string; name: string; restaurantName: string };
  kdsEnabled: boolean;
};

export function CookKitchenDashboard({ user, kdsEnabled }: CookKitchenDashboardProps) {
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedCategorySlugs, setSelectedCategorySlugs] = useState<Set<string>>(
    () => loadSavedCategoryFilter(),
  );
  const [tickets, setTickets] = useState<KitchenBoardTicket[]>([]);
  const [alerts, setAlerts] = useState<StaffAlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  const { alertsEnabled, showEnableBanner, enableAlerts, enabling, statusMessage } =
    useStaffNotifications(alerts, user.id);

  const loadAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const kitchenAlerts = (data.alerts ?? []).filter(
        (alert: StaffAlertItem & { isRead?: boolean }) =>
          !alert.isRead &&
          (alert.type === "OVERDUE" || alert.type === "ALARM" || alert.type === "NEW_KITCHEN_ITEM"),
      );
      setAlerts(kitchenAlerts);
    } catch (error) {
      swallowPollingFetchError(error);
    }
  }, []);

  useKitchenTicketAlerts(tickets, selectedCategorySlugs);

  const loadKitchen = useCallback(async () => {
    if (!kdsEnabled || isClientOffline()) return;
    try {
      const res = await fetch("/api/kitchen/orders?station=all", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setStations(data.stations ?? []);
        setTickets(data.tickets ?? []);
      }
      await loadAlerts();
    } catch (error) {
      swallowPollingFetchError(error);
    }
  }, [kdsEnabled, loadAlerts]);

  useEffect(() => {
    void loadKitchen().finally(() => setLoading(false));
    const poll = setInterval(() => {
      if (document.hidden) return;
      void loadKitchen();
    }, 5000);
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
  }, [loadKitchen]);

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
    window.location.href = "/";
  };

  const openCount = tickets.reduce(
    (sum, ticket) =>
      sum +
      ticket.items.filter(
        (item) =>
          ["PENDING", "PREPARING", "READY"].includes(item.status) &&
          matchesCategoryFilter(item.categorySlug),
      ).length,
    0,
  );

  const overdueCount = tickets.reduce(
    (sum, ticket) =>
      sum +
      ticket.items.filter(
        (item) =>
          item.isOverdue &&
          ["PENDING", "PREPARING", "READY"].includes(item.status) &&
          matchesCategoryFilter(item.categorySlug),
      ).length,
    0,
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-app-shell flex items-center justify-center">
        <Spinner className="w-10 h-10" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app-shell text-foreground">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-app-shell/95 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/20 flex items-center justify-center shrink-0">
              <ChefHat className="w-7 h-7 text-orange-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold truncate">{user.restaurantName}</h1>
              <p className="text-sm text-zinc-400 truncate">
                {user.name} · Kitchen ·{" "}
                <span className="text-orange-300 font-medium">{openCount} open</span>
                {overdueCount > 0 && (
                  <>
                    {" "}
                    ·{" "}
                    <span className="text-red-300 font-semibold">
                      {overdueCount} overdue
                    </span>
                  </>
                )}
              </p>
            </div>
            {overdueCount > 0 && (
              <div className="hidden sm:flex items-center gap-2 rounded-xl border border-red-500/50 bg-red-500/15 px-3 py-2 shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-300 animate-pulse" />
                <span className="text-sm font-bold text-red-200">{overdueCount} OVERDUE</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!alertsEnabled && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void enableAlerts()}
                disabled={enabling}
                className="border-orange-500/30 text-orange-200"
              >
                <Volume2 className="w-4 h-4" />
                {enabling ? "…" : "Sound on"}
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => void loadKitchen()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void logout()}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {overdueCount > 0 && (
          <div className="border-t border-red-500/40 bg-red-500/15 px-4 py-3">
            <p className="max-w-[1600px] mx-auto text-sm text-red-100 flex items-center gap-2 font-medium">
              <AlertTriangle className="w-5 h-5 text-red-300 shrink-0 animate-pulse" />
              {overdueCount} ticket{overdueCount === 1 ? "" : "s"} past prep time — red cards are sorted to the top. Hit START or READY now.
            </p>
          </div>
        )}

        {showEnableBanner && (
          <div className="border-t border-orange-500/30 bg-orange-500/10 px-4 py-3">
            <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-orange-100">
                Turn on sound alerts to hear new tickets and overdue chimes for your station.
              </p>
              <Button size="sm" onClick={() => void enableAlerts()} disabled={enabling}>
                <Volume2 className="w-4 h-4" />
                {enabling ? "Enabling…" : "Enable alerts"}
              </Button>
            </div>
            {statusMessage && <p className="max-w-[1600px] mx-auto mt-2 text-xs text-orange-200/80">{statusMessage}</p>}
          </div>
        )}

        {kdsEnabled && stations.length > 0 && (
          <div className="border-t border-white/5 px-4 py-3">
            <div className="max-w-[1600px] mx-auto flex flex-wrap gap-2">
              <button
                type="button"
                onClick={clearCategoryFilter}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-semibold border transition-colors",
                  selectedCategorySlugs.size === 0
                    ? "bg-white/15 border-white/25 text-white"
                    : "border-white/10 text-zinc-400 hover:text-white",
                )}
              >
                All stations
              </button>
              {stations.map((station) => {
                const isSelected = selectedCategorySlugs.has(station.slug);
                return (
                  <button
                    key={station.id}
                    type="button"
                    onClick={() => toggleCategoryFilter(station.slug)}
                    className={cn(
                      "px-4 py-2 rounded-xl text-sm font-semibold border transition-colors",
                      isSelected ? "text-white border-white/25" : "border-white/10 text-zinc-400 hover:text-white",
                    )}
                    style={
                      isSelected
                        ? { backgroundColor: `${station.color}44`, borderColor: `${station.color}88` }
                        : undefined
                    }
                  >
                    {station.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      <main className="max-w-[1600px] mx-auto p-4 pb-8">
        {!kdsEnabled ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-8 text-center">
            <p className="text-lg font-semibold text-amber-200">Kitchen display is not enabled</p>
            <p className="text-sm text-zinc-400 mt-2">Ask your manager to turn on KDS for this restaurant.</p>
          </div>
        ) : (
          <KitchenTicketBoard
            tickets={tickets}
            now={now}
            matchesCategoryFilter={matchesCategoryFilter}
            onUpdateItem={updateItem}
            mode="cook"
          />
        )}
      </main>
    </div>
  );
}

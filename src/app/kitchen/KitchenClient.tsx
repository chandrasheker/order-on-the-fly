"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ChefHat,
  LogOut,
  RefreshCw,
  LayoutDashboard,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { isClientOffline, swallowPollingFetchError } from "@/lib/client-fetch";
import { useKitchenTicketAlerts } from "@/hooks/useKitchenTicketAlerts";
import { useStaffNotifications } from "@/hooks/useStaffNotifications";
import { Bell, Volume2 } from "lucide-react";
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

export default function KitchenClient() {
  const router = useRouter();
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedCategorySlugs, setSelectedCategorySlugs] = useState<Set<string>>(
    () => loadSavedCategoryFilter(),
  );
  const [tickets, setTickets] = useState<KitchenBoardTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [role, setRole] = useState<string>("COOK");
  const [userId, setUserId] = useState<string | null>(null);

  const { showEnableBanner, enableAlerts, enabling, statusMessage } = useStaffNotifications([], userId);

  useKitchenTicketAlerts(tickets, selectedCategorySlugs);

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
        const userRole = me.user?.role ?? "COOK";
        setRole(userRole);
        setUserId(me.user?.id ?? null);
        if (userRole === "COOK") {
          router.replace("/staff/dashboard");
          return;
        }
      }
      await loadKitchen();
    } catch (error) {
      swallowPollingFetchError(error);
    } finally {
      setLoading(false);
    }
  }, [loadKitchen, router]);

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
            <Button variant="secondary" size="sm" onClick={() => void loadKitchen()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            {(role === "OWNER" || role === "MANAGER") && (
              <Link href="/staff/dashboard">
                <Button variant="secondary" size="sm">
                  <LayoutDashboard className="w-4 h-4" /> Dashboard
                </Button>
              </Link>
            )}
            <Button variant="secondary" size="sm" onClick={() => void logout()}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {showEnableBanner && (
        <div className="border-b border-orange-500/30 bg-orange-500/10 px-4 py-3">
          <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2 text-sm text-orange-100">
              <Bell className="w-4 h-4 mt-0.5 shrink-0" />
              <p>
                Enable kitchen alerts to hear a chime when new tickets arrive for your selected
                categories.
              </p>
            </div>
            <Button size="sm" onClick={() => void enableAlerts()} disabled={enabling}>
              <Volume2 className="w-4 h-4" />
              {enabling ? "Enabling…" : "Enable alerts"}
            </Button>
          </div>
          {statusMessage && (
            <p className="max-w-[1600px] mx-auto mt-2 text-xs text-orange-200/80">{statusMessage}</p>
          )}
        </div>
      )}

      <main className="max-w-[1600px] mx-auto p-4">
        <KitchenTicketBoard
          tickets={tickets}
          now={now}
          matchesCategoryFilter={matchesCategoryFilter}
          onUpdateItem={updateItem}
          mode="standard"
        />
      </main>
    </div>
  );
}

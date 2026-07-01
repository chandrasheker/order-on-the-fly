"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Bell,
  ChefHat,
  Flame,
  LogOut,
  Play,
  RefreshCw,
  Volume2,
} from "lucide-react";
import { Spinner } from "@/components/ui";
import { cn, formatCountdown } from "@/lib/utils";
import { isClientOffline, swallowPollingFetchError } from "@/lib/client-fetch";
import { useKitchenTicketAlerts } from "@/hooks/useKitchenTicketAlerts";
import { useStaffNotifications, type StaffAlertItem } from "@/hooks/useStaffNotifications";
import type { KitchenBoardTicket } from "@/components/kitchen/KitchenTicketBoard";
import { SiteFooter } from "@/components/SiteFooter";

type Station = {
  id: string;
  name: string;
  slug: string;
  color: string;
};

type WorkItem = {
  ticket: KitchenBoardTicket;
  item: KitchenBoardTicket["items"][number];
};

const KDS_CATEGORY_FILTER_KEY = "kds-category-filter";

function useViewportSize() {
  const [size, setSize] = useState({ width: 1024, height: 768 });

  useEffect(() => {
    const update = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return size;
}

/** How many ticket tiles fit on screen without any scrolling. */
function maxVisibleTiles(width: number, height: number) {
  if (width < 480) return height < 640 ? 4 : 6;
  if (width < 768) return 6;
  if (width < 1024) return 9;
  return 12;
}

function gridForCount(count: number, width: number) {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count <= 2) return { cols: width < 640 ? 1 : 2, rows: 2 };
  if (count <= 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: width < 768 ? 2 : 3, rows: 3 };
  if (count <= 9) return { cols: 3, rows: 3 };
  return { cols: width < 1024 ? 3 : 4, rows: Math.ceil(count / (width < 1024 ? 3 : 4)) };
}

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
  restaurantLogoUrl?: string | null;
  kdsEnabled: boolean;
};

export function CookKitchenDashboard({
  user,
  restaurantLogoUrl,
  kdsEnabled,
}: CookKitchenDashboardProps) {
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedCategorySlugs, setSelectedCategorySlugs] = useState<Set<string>>(
    () => loadSavedCategoryFilter(),
  );
  const [tickets, setTickets] = useState<KitchenBoardTicket[]>([]);
  const [alerts, setAlerts] = useState<StaffAlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [actingId, setActingId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const viewport = useViewportSize();

  const { alertsEnabled, enableAlerts, enabling } = useStaffNotifications(alerts, user.id);

  useKitchenTicketAlerts(tickets, selectedCategorySlugs);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("cook-kiosk");
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.classList.remove("cook-kiosk");
    };
  }, []);

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

  const matchesCategoryFilter = useCallback(
    (categorySlug: string) =>
      selectedCategorySlugs.size === 0 || selectedCategorySlugs.has(categorySlug),
    [selectedCategorySlugs],
  );

  const workItems = useMemo(() => {
    const rows: WorkItem[] = [];
    for (const ticket of tickets) {
      for (const item of ticket.items) {
        if (!matchesCategoryFilter(item.categorySlug)) continue;
        if (item.status === "PENDING" || item.status === "PREPARING") {
          rows.push({ ticket, item });
        }
      }
    }
    return rows.sort((a, b) => {
      if (a.item.isOverdue !== b.item.isOverdue) return a.item.isOverdue ? -1 : 1;
      return (
        new Date(a.item.expectedReadyAt).getTime() - new Date(b.item.expectedReadyAt).getTime()
      );
    });
  }, [tickets, matchesCategoryFilter]);

  const readyLabels = useMemo(() => {
    const labels: string[] = [];
    for (const ticket of tickets) {
      for (const item of ticket.items) {
        if (!matchesCategoryFilter(item.categorySlug)) continue;
        if (item.status !== "READY") continue;
        labels.push(
          `${ticket.locationLabel ?? `T${ticket.tableNumber}`} ${item.quantity}x ${item.itemName}`,
        );
      }
    }
    return labels;
  }, [tickets, matchesCategoryFilter]);

  const overdueCount = workItems.filter((row) => row.item.isOverdue).length;

  const maxVisible = maxVisibleTiles(viewport.width, viewport.height);
  const totalPages = Math.max(1, Math.ceil(workItems.length / maxVisible));

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages - 1));
  }, [totalPages]);

  const visibleItems = useMemo(() => {
    const start = page * maxVisible;
    return workItems.slice(start, start + maxVisible);
  }, [workItems, page, maxVisible]);

  const waitingCount = Math.max(0, workItems.length - visibleItems.length);
  const gridLayout = gridForCount(visibleItems.length, viewport.width);

  const toggleCategoryFilter = (slug: string) => {
    setSelectedCategorySlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      localStorage.setItem(KDS_CATEGORY_FILTER_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const updateItem = async (orderId: string, itemId: string, action: string) => {
    setActingId(itemId);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, itemId }),
      });
      if (!res.ok) return;

      if (action === "reject-item") {
        setTickets((prev) =>
          prev
            .map((ticket) =>
              ticket.id !== orderId
                ? ticket
                : { ...ticket, items: ticket.items.filter((item) => item.id !== itemId) },
            )
            .filter((ticket) => ticket.items.length > 0),
        );
      }

      await loadKitchen();
    } catch (error) {
      swallowPollingFetchError(error);
    } finally {
      setActingId(null);
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

  if (loading) {
    return (
      <div className="fixed inset-0 z-[60] bg-app-shell flex items-center justify-center overflow-hidden">
        <Spinner className="w-10 h-10" />
      </div>
    );
  }

  const topAlert = alerts[0];

  return (
    <div className="fixed inset-0 z-[60] w-full flex flex-col overflow-hidden bg-app-shell text-foreground touch-manipulation">
      {/* Top bar — fixed height */}
      <header className="shrink-0 border-b border-white/10 px-2 sm:px-3 py-2 flex items-center gap-2">
        {restaurantLogoUrl ? (
          <img
            src={restaurantLogoUrl}
            alt=""
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg object-contain bg-white/5 border border-white/10 shrink-0"
          />
        ) : (
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-center shrink-0">
            <ChefHat className="w-6 h-6 text-orange-400" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold truncate leading-tight">{user.restaurantName}</p>
          <p className="text-[11px] text-zinc-500 truncate">
            {workItems.length} to cook
            {waitingCount > 0 && ` · +${waitingCount} on next page`}
            {readyLabels.length > 0 && ` · ${readyLabels.length} ready`}
            {overdueCount > 0 && (
              <span className="text-red-400 font-semibold"> · {overdueCount} overdue</span>
            )}
          </p>
        </div>
        {totalPages > 1 && (
          <div className="shrink-0 flex items-center gap-0.5">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="h-9 min-w-9 px-2 rounded-lg bg-white/5 border border-white/10 text-zinc-300 disabled:opacity-30 font-bold text-sm"
            >
              ◀
            </button>
            <span className="text-[10px] text-zinc-500 tabular-nums min-w-[2.5rem] text-center">
              {page + 1}/{totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="h-9 min-w-9 px-2 rounded-lg bg-white/5 border border-white/10 text-zinc-300 disabled:opacity-30 font-bold text-sm"
            >
              ▶
            </button>
          </div>
        )}
        {overdueCount > 0 && (
          <div className="shrink-0 flex items-center gap-1 rounded-lg bg-red-500/20 border border-red-500/40 px-2 py-1">
            <AlertTriangle className="w-4 h-4 text-red-300 animate-pulse" />
            <span className="text-xs font-bold text-red-200">{overdueCount}</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => void enableAlerts()}
          disabled={enabling}
          className={cn(
            "shrink-0 p-2 rounded-xl border",
            alertsEnabled
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
              : "border-orange-500/40 bg-orange-500/15 text-orange-300 animate-pulse",
          )}
          title={alertsEnabled ? "Sound on" : "Turn sound on"}
        >
          <Volume2 className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => void loadKitchen()}
          className="shrink-0 p-2 rounded-xl bg-white/5 border border-white/10 text-zinc-300"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => void logout()}
          className="shrink-0 p-2 rounded-xl bg-white/5 border border-white/10 text-zinc-300"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      {/* Station chips — one row, no wrap scroll on main content */}
      {kdsEnabled && stations.length > 0 && (
        <div className="shrink-0 border-b border-white/5 px-2 py-1.5 flex flex-wrap gap-1 max-h-14 overflow-hidden">
          <StationChip
            label="All"
            active={selectedCategorySlugs.size === 0}
            onClick={() => {
              setSelectedCategorySlugs(new Set());
              localStorage.removeItem(KDS_CATEGORY_FILTER_KEY);
            }}
          />
          {stations.map((station) => (
            <StationChip
              key={station.id}
              label={station.name}
              active={selectedCategorySlugs.has(station.slug)}
              color={station.color}
              onClick={() => toggleCategoryFilter(station.slug)}
            />
          ))}
        </div>
      )}

      {/* Live alert — one line only */}
      {topAlert && (
        <div className="shrink-0 bg-red-500/15 border-b border-red-500/30 px-3 py-1.5 flex items-center gap-2">
          <Bell className="w-4 h-4 text-red-300 shrink-0 animate-bounce" />
          <p className="text-xs text-red-100 truncate font-medium">{topAlert.message}</p>
        </div>
      )}

      {/* Work grid — fills all remaining space, no page scroll */}
      <main className="flex-1 min-h-0 p-1.5 sm:p-2 overflow-hidden">
        {!kdsEnabled ? (
          <div className="h-full flex items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
            <p className="text-amber-200 font-medium">Kitchen display is not enabled</p>
          </div>
        ) : workItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] text-center px-4">
            <ChefHat className="w-12 h-12 text-zinc-600 mb-2" />
            <p className="text-lg font-semibold text-zinc-400">All clear</p>
            <p className="text-sm text-zinc-600 mt-1">New tickets will appear here automatically</p>
          </div>
        ) : (
          <div
            className="h-full grid gap-1.5 sm:gap-2"
            style={{
              gridTemplateColumns: `repeat(${gridLayout.cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${gridLayout.rows}, minmax(0, 1fr))`,
            }}
          >
            {visibleItems.map(({ ticket, item }) => (
              <CookWorkTile
                key={item.id}
                ticket={ticket}
                item={item}
                now={now}
                busy={actingId === item.id}
                onAction={(action) => void updateItem(ticket.id, item.id, action)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Ready strip */}
      {readyLabels.length > 0 && (
        <div className="shrink-0 border-t border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5">
          <p className="text-[11px] text-emerald-400/80 font-medium mb-0.5">Ready for server</p>
          <p className="text-xs text-emerald-200 truncate">{readyLabels.join(" · ")}</p>
        </div>
      )}

      <SiteFooter embedded />
    </div>
  );
}

function StationChip({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 px-3 py-1 rounded-lg text-xs font-bold border transition-colors",
        active ? "text-white border-white/25" : "border-white/10 text-zinc-500",
      )}
      style={
        active && color
          ? { backgroundColor: `${color}44`, borderColor: `${color}88` }
          : active
            ? { backgroundColor: "rgba(255,255,255,0.12)" }
            : undefined
      }
    >
      {label}
    </button>
  );
}

function CookWorkTile({
  ticket,
  item,
  now,
  busy,
  onAction,
}: {
  ticket: KitchenBoardTicket;
  item: KitchenBoardTicket["items"][number];
  now: number;
  busy: boolean;
  onAction: (action: string) => void;
}) {
  const remaining = Math.max(
    0,
    Math.floor((new Date(item.expectedReadyAt).getTime() - now) / 1000),
  );
  const isPending = item.status === "PENDING";

  return (
    <div
      className={cn(
        "min-h-0 rounded-xl border flex flex-col overflow-hidden",
        item.isOverdue
          ? "border-red-500/60 bg-red-500/15 shadow-[inset_0_0_20px_rgba(239,68,68,0.12)]"
          : "border-white/10 bg-black/30",
      )}
    >
      <div className="shrink-0 px-2 pt-2 pb-1 flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="text-2xl sm:text-3xl font-black leading-none truncate">
            {ticket.locationLabel ?? `T${ticket.tableNumber}`}
          </p>
          <p className="text-[10px] text-zinc-500 truncate">#{ticket.orderNumber}</p>
        </div>
        <span
          className={cn(
            "shrink-0 text-[10px] sm:text-xs font-bold font-mono px-1.5 py-0.5 rounded",
            item.isOverdue ? "bg-red-500/30 text-red-200" : "bg-white/10 text-zinc-400",
          )}
        >
          {item.isOverdue ? "LATE" : remaining > 0 ? formatCountdown(remaining) : "NOW"}
        </span>
      </div>

      <div className="flex-1 min-h-0 px-2 flex items-center">
        <p className="text-sm sm:text-base font-bold leading-tight line-clamp-2">
          {item.quantity}x {item.itemName}
        </p>
      </div>

      <div className="shrink-0 p-1.5 grid gap-1 grid-cols-2">
        {isPending ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction("prepare-item")}
            className="h-11 sm:h-12 rounded-lg bg-sky-500 hover:bg-sky-400 active:scale-[0.98] text-white font-black text-sm sm:text-base flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Play className="w-5 h-5" />
            START
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction("reject-item")}
          className={cn(
            "h-11 sm:h-12 rounded-lg border-2 border-red-500/50 bg-red-500/20 hover:bg-red-500/30 active:scale-[0.98] text-red-200 font-bold text-xs sm:text-sm flex items-center justify-center gap-1 disabled:opacity-50",
            isPending ? "" : "col-span-2",
          )}
        >
          <Ban className="w-4 h-4" />
          OOS
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction("ready-item")}
          className="col-span-2 h-11 sm:h-12 rounded-lg bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-white font-black text-sm sm:text-base flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Flame className="w-5 h-5" />
          READY
        </button>
      </div>
    </div>
  );
}

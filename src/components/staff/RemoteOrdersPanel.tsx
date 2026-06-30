"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Phone,
  UserRound,
  ShoppingBag,
  Truck,
  ExternalLink,
} from "lucide-react";
import { MenuView } from "@/components/customer/MenuView";
import { StaffCartPanel } from "@/components/staff/StaffCartPanel";
import { TableOrderHistory } from "@/components/staff/TableOrderHistory";
import { Input, Spinner, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useStaffCartStore } from "@/store/staff-cart";
import type { KitchenChitPayload } from "@/lib/kitchen-chit-service";

type OrderMode = "walkin" | "takeaway" | "delivery" | "swiggy" | "zomato";

type TableRow = {
  id: string;
  number: number;
  orderingEnabled: boolean;
  activeSessions: number;
};

type MenuCategory = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  items: Array<{
    id: string;
    name: string;
    description: string | null;
    price: number;
    prepTimeMinutes: number;
    isVeg: boolean;
    isSpicy: boolean;
    isAvailable: boolean;
  }>;
};

interface RemoteOrdersPanelProps {
  aggregatorEnabled?: boolean;
  onOrderPlaced?: (result?: { kitchenChit?: KitchenChitPayload | null }) => void;
}

const MODE_META: Record<
  OrderMode,
  { label: string; description: string; channel?: string; needsTable: boolean; premium?: "aggregator" }
> = {
  walkin: {
    label: "Walk-in / table",
    description: "Guest at a table — pick table, add items, send to kitchen.",
    needsTable: true,
  },
  takeaway: {
    label: "Takeaway",
    description: "Pack and hand over — no table needed.",
    channel: "TAKEAWAY",
    needsTable: false,
  },
  delivery: {
    label: "Delivery",
    description: "Out for delivery — capture phone and address notes.",
    channel: "DELIVERY",
    needsTable: false,
  },
  swiggy: {
    label: "Swiggy",
    description: "Enter Swiggy order ID and items — lands on kitchen board.",
    channel: "SWIGGY",
    needsTable: false,
    premium: "aggregator",
  },
  zomato: {
    label: "Zomato",
    description: "Enter Zomato order ID and items — lands on kitchen board.",
    channel: "ZOMATO",
    needsTable: false,
    premium: "aggregator",
  },
};

export function RemoteOrdersPanel({ aggregatorEnabled = false, onOrderPlaced }: RemoteOrdersPanelProps) {
  const [mode, setMode] = useState<OrderMode>("walkin");
  const [tables, setTables] = useState<TableRow[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loadingTables, setLoadingTables] = useState(true);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [customerPhone, setCustomerPhone] = useState("");
  const [externalOrderId, setExternalOrderId] = useState("");
  const [orderNotes, setOrderNotes] = useState("");

  const {
    tableId,
    customerName,
    items,
    setTable,
    setCustomerName,
    addItem,
    updateQuantity,
    updateNotes,
    clearCart,
    total,
    maxPrepTime,
  } = useStaffCartStore();

  const meta = MODE_META[mode];
  const dineInTables = tables.filter((t) => t.number < 900);
  const selectedTable = useMemo(
    () => dineInTables.find((table) => table.id === tableId) ?? null,
    [dineInTables, tableId],
  );

  const readyForMenu = meta.needsTable ? Boolean(tableId) : true;

  const loadTables = useCallback(async () => {
    const res = await fetch("/api/tables/manage");
    if (res.ok) {
      const json = await res.json();
      setTables(json.tables ?? []);
    }
    setLoadingTables(false);
  }, []);

  const loadMenu = useCallback(async () => {
    setLoadingMenu(true);
    setError("");
    try {
      const res = await fetch("/api/menu/staff");
      if (!res.ok) throw new Error("Could not load menu");
      const json = await res.json();
      setCategories(json.categories ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load menu");
    } finally {
      setLoadingMenu(false);
    }
  }, []);

  useEffect(() => {
    void loadTables();
  }, [loadTables]);

  useEffect(() => {
    if (readyForMenu) void loadMenu();
  }, [readyForMenu, loadMenu]);

  const resetMode = (next: OrderMode) => {
    setMode(next);
    setTable(null);
    clearCart();
    setCustomerPhone("");
    setExternalOrderId("");
    setOrderNotes("");
    setError("");
    setSuccess("");
  };

  const cartControls = useMemo(
    () => ({ items, addItem, updateQuantity, total, maxPrepTime }),
    [items, addItem, updateQuantity, total, maxPrepTime],
  );

  const placeOrder = async () => {
    if (items.length === 0) return;
    if (meta.needsTable && !tableId) return;

    setPlacing(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        externalOrderId: externalOrderId.trim() || undefined,
        orderNotes: orderNotes.trim() || undefined,
        items: items.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          notes: item.notes?.trim() || undefined,
        })),
      };

      let res: Response;
      if (meta.channel && meta.premium === "aggregator") {
        res = await fetch("/api/orders/aggregator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, channel: meta.channel }),
        });
      } else if (meta.channel) {
        res = await fetch("/api/orders/staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, channel: meta.channel, openTable: false }),
        });
      } else {
        res = await fetch("/api/orders/staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, tableId, openTable: true }),
        });
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not place order");

      const label =
        mode === "walkin" && selectedTable
          ? `Table ${selectedTable.number}`
          : meta.label;
      setSuccess(`Order #${json.order?.orderNumber ?? ""} sent to kitchen · ${label}`);
      clearCart();
      setCustomerPhone("");
      setExternalOrderId("");
      setOrderNotes("");
      setHistoryRefreshKey((key) => key + 1);
      await loadTables();
      onOrderPlaced?.({ kitchenChit: json.kitchenChit ?? null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not place order");
    } finally {
      setPlacing(false);
    }
  };

  if (loadingTables) {
    return (
      <div className="py-16 flex justify-center">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  const modes: OrderMode[] = ["walkin", "takeaway", "delivery"];
  if (aggregatorEnabled) {
    modes.push("swiggy", "zomato");
  }

  if (meta.needsTable && !tableId) {
    return (
      <div className="space-y-5">
        <ModePicker modes={modes} mode={mode} onChange={resetMode} aggregatorEnabled={aggregatorEnabled} />

        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5">
          <p className="text-sm text-zinc-400">{meta.description}</p>
        </div>

        <div>
          <p className="text-sm text-zinc-400 mb-3">Select table</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {dineInTables.map((table) => (
              <button
                key={table.id}
                type="button"
                onClick={() => setTable(table.id)}
                className={cn(
                  "rounded-2xl border p-4 text-left transition-all hover:border-violet-500/40 hover:bg-violet-500/10",
                  table.orderingEnabled
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-white/10 bg-white/5",
                )}
              >
                <p className="text-lg font-bold text-white">Table {table.number}</p>
                <p className="text-xs text-zinc-400 mt-1">
                  {table.orderingEnabled ? "Open" : "Closed · staff can order"}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-28">
      <div className="sticky top-[4.5rem] z-20 -mx-1 px-1 py-3 bg-[#0a0a12]/95 backdrop-blur-md border-b border-white/5 space-y-3">
        <ModePicker modes={modes} mode={mode} onChange={resetMode} aggregatorEnabled={aggregatorEnabled} compact />

        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            {meta.needsTable && (
              <button
                type="button"
                onClick={() => setTable(null)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-zinc-300 hover:text-white"
              >
                <ArrowLeft className="w-4 h-4" />
                Tables
              </button>
            )}
            <div>
              <p className="font-semibold text-white">{meta.label}</p>
              {selectedTable && (
                <p className="text-xs text-zinc-500">Table {selectedTable.number}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 flex-1 justify-end">
            <div className="flex items-center gap-2 min-w-[180px]">
              <UserRound className="w-4 h-4 text-zinc-500 shrink-0" />
              <Input
                placeholder="Guest name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="h-10"
              />
            </div>
            {(mode === "delivery" || mode === "swiggy" || mode === "zomato") && (
              <Input
                placeholder="Phone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="h-10 min-w-[160px]"
              />
            )}
            {(mode === "swiggy" || mode === "zomato") && (
              <Input
                placeholder={`${meta.label} order ID`}
                value={externalOrderId}
                onChange={(e) => setExternalOrderId(e.target.value)}
                className="h-10 min-w-[180px]"
              />
            )}
          </div>
        </div>

        {(mode === "delivery" || mode === "takeaway") && (
          <Input
            placeholder={mode === "delivery" ? "Delivery address / notes" : "Pickup notes (optional)"}
            value={orderNotes}
            onChange={(e) => setOrderNotes(e.target.value)}
            className="h-10"
          />
        )}
      </div>

      {meta.needsTable && tableId && (
        <TableOrderHistory tableId={tableId} refreshKey={historyRefreshKey} />
      )}

      {items.length > 0 && (
        <StaffCartPanel
          items={items}
          total={total()}
          maxPrepTime={maxPrepTime()}
          placing={placing}
          onUpdateQuantity={updateQuantity}
          onUpdateNotes={updateNotes}
          onPlaceOrder={() => void placeOrder()}
        />
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {success}
        </div>
      )}

      {loadingMenu ? (
        <div className="py-16 flex justify-center">
          <Spinner className="w-8 h-8" />
        </div>
      ) : categories.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-zinc-400">
          No menu items are available right now.
        </div>
      ) : (
        <MenuView
          categories={categories.map((category) => ({
            ...category,
            icon: category.icon ?? "🍽️",
          }))}
          onOrder={() => void placeOrder()}
          ordering={placing}
          canOrder
          cart={cartControls}
          orderButtonLabel={
            placing
              ? "Sending order..."
              : `Send to kitchen · ${items.reduce((sum, item) => sum + item.quantity, 0)} items`
          }
        />
      )}
    </div>
  );
}

function ModePicker({
  modes,
  mode,
  onChange,
  aggregatorEnabled,
  compact,
}: {
  modes: OrderMode[];
  mode: OrderMode;
  onChange: (mode: OrderMode) => void;
  aggregatorEnabled: boolean;
  compact?: boolean;
}) {
  const icons: Record<OrderMode, typeof Phone> = {
    walkin: Phone,
    takeaway: ShoppingBag,
    delivery: Truck,
    swiggy: ExternalLink,
    zomato: ExternalLink,
  };

  return (
    <div className={cn("flex flex-wrap gap-2", compact ? "" : "mb-2")}>
      {modes.map((entry) => {
        const Icon = icons[entry];
        const active = mode === entry;
        return (
          <button
            key={entry}
            type="button"
            onClick={() => onChange(entry)}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors",
              active
                ? "bg-violet-500/20 border-violet-500/40 text-violet-100"
                : "bg-white/5 border-white/10 text-zinc-400 hover:text-white",
            )}
          >
            <Icon className="w-4 h-4" />
            {MODE_META[entry].label}
            {entry === "swiggy" || entry === "zomato" ? (
              <Badge className="bg-orange-500/15 text-orange-300 border-orange-500/30 text-[10px]">
                Inbox
              </Badge>
            ) : null}
          </button>
        );
      })}
      {!aggregatorEnabled && !compact && (
        <p className="text-xs text-zinc-500 w-full mt-1">
          Swiggy / Zomato inbox is a premium add-on — enable via TableTap super admin.
        </p>
      )}
    </div>
  );
}

/** @deprecated use RemoteOrdersPanel */
export const OfflineOrderPanel = RemoteOrdersPanel;

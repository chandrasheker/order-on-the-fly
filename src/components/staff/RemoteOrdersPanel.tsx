"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Phone, UserRound, ShoppingBag, Truck, Printer } from "lucide-react";
import { MenuView } from "@/components/customer/MenuView";
import { StaffCartDrawer, StaffCartPanel } from "@/components/staff/StaffCartPanel";
import { Button, Input, Spinner } from "@/components/ui";
import { cn, formatCurrency } from "@/lib/utils";
import { useStaffCartStore } from "@/store/staff-cart";
import { useOfflineOrderSync } from "@/hooks/useOfflineOrderSync";
import { useCartDraftSync, clearRemoteCartDraft } from "@/hooks/useCartDraftSync";
import { useFloorTableStates } from "@/hooks/useFloorTableStates";
import { useThermalPrinter } from "@/hooks/useThermalPrinter";
import type { KitchenChitPayload } from "@/lib/kitchen-chit-service";
import { swallowPollingFetchError } from "@/lib/client-fetch";
import { FLOOR_STATE_STYLES, TABLE_CLOSED_STYLE, notifyFloorChanged } from "@/lib/floor-state-styles";
import { printStaffTicketHtml } from "@/lib/print-staff-ticket";

type OrderMode = "walkin" | "takeaway" | "delivery";

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
    imageUrl?: string | null;
  }>;
};

interface RemoteOrdersPanelProps {
  onOrderPlaced?: (result?: { kitchenChit?: KitchenChitPayload | null }) => void;
  initialMode?: OrderMode;
  stickyClassName?: string;
  splitCart?: boolean;
}

const MODE_META: Record<
  OrderMode,
  { label: string; description: string; channel?: string; needsTable: boolean; icon: typeof Phone }
> = {
  walkin: {
    label: "Walk-in / table",
    description: "Guest at a table — pick table, add items, send to kitchen.",
    needsTable: true,
    icon: Phone,
  },
  takeaway: {
    label: "Takeaway",
    description: "Pack and hand over — no table needed.",
    channel: "TAKEAWAY",
    needsTable: false,
    icon: ShoppingBag,
  },
  delivery: {
    label: "Delivery",
    description: "Out for delivery — capture phone and address notes.",
    channel: "DELIVERY",
    needsTable: false,
    icon: Truck,
  },
};

export function RemoteOrdersPanel({
  onOrderPlaced,
  initialMode = "walkin",
  stickyClassName = "top-[4.5rem]",
  splitCart = false,
}: RemoteOrdersPanelProps) {
  const [mode, setMode] = useState<OrderMode>(initialMode);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loadingTables, setLoadingTables] = useState(true);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [staffFulfillment, setStaffFulfillment] = useState<"TABLE_SERVICE" | "SELF_PICKUP">("TABLE_SERVICE");
  const [cartOpen, setCartOpen] = useState(false);
  const [tablesOpen, setTablesOpen] = useState(true);
  const [lastChit, setLastChit] = useState<KitchenChitPayload | null>(null);
  const { states } = useFloorTableStates();
  const { printKitchenChit, printing } = useThermalPrinter();

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
  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const isSelf = !meta.channel && staffFulfillment === "SELF_PICKUP";

  const loadTables = useCallback(async () => {
    try {
      const res = await fetch("/api/tables/manage");
      if (res.ok) {
        const json = await res.json();
        setTables(json.tables ?? []);
      }
    } catch (error) {
      swallowPollingFetchError(error);
    } finally {
      setLoadingTables(false);
    }
  }, []);

  const { online, pendingCount, queueOrder, syncPending, cachedMenu, storeMenu } =
    useOfflineOrderSync(true, undefined);

  useCartDraftSync({
    enabled: Boolean(tableId) && mode === "walkin",
    source: "STAFF",
    tableId,
    items,
  });

  const loadMenu = useCallback(async () => {
    setLoadingMenu(true);
    setError("");
    try {
      const res = await fetch("/api/menu/staff");
      if (!res.ok) throw new Error("Could not load menu");
      const json = await res.json();
      setCategories(json.categories ?? []);
      await storeMenu(json.categories ?? []);
    } catch (err) {
      if (cachedMenu && Array.isArray(cachedMenu)) {
        setCategories(cachedMenu as MenuCategory[]);
        setError("Using cached menu (offline)");
      } else {
        setError(err instanceof Error ? err.message : "Could not load menu");
      }
    } finally {
      setLoadingMenu(false);
    }
  }, [cachedMenu, storeMenu]);

  useEffect(() => {
    void loadTables();
  }, [loadTables]);

  useEffect(() => {
    void loadMenu();
  }, [loadMenu]);

  const resetMode = (next: OrderMode) => {
    setMode(next);
    setTable(null);
    clearCart();
    setCustomerPhone("");
    setOrderNotes("");
    setError("");
    setSuccess("");
    setCartOpen(false);
    setTablesOpen(true);
  };

  useEffect(() => {
    if (initialMode !== mode) {
      resetMode(initialMode);
    }
    // Sync only when the dashboard button changes the starting mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- parent intent, not every mode flip
  }, [initialMode]);

  const handleClearCart = () => {
    clearCart();
    if (tableId && mode === "walkin") {
      void clearRemoteCartDraft({ source: "STAFF", tableId });
    }
    setError("");
    setSuccess("");
  };

  const cartControls = useMemo(
    () => ({ items, addItem, updateQuantity, total, maxPrepTime }),
    [items, addItem, updateQuantity, total, maxPrepTime],
  );

  const printTicket = async (chit: KitchenChitPayload) => {
    try {
      await printKitchenChit(chit);
    } catch {
      printStaffTicketHtml(chit);
    }
  };

  const placeOrder = async (alsoPrint: boolean) => {
    if (items.length === 0) return;
    if (meta.needsTable && !tableId) {
      setError("Pick a table before sending this order to the kitchen.");
      setCartOpen(false);
      return;
    }

    setPlacing(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        orderNotes: orderNotes.trim() || undefined,
        items: items.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          notes: item.notes?.trim() || undefined,
        })),
      };

      let res: Response;
      try {
        if (meta.channel) {
          res = await fetch("/api/orders/staff", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, channel: meta.channel, openTable: false }),
          });
        } else {
          res = await fetch("/api/orders/staff", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...payload,
              tableId,
              openTable: true,
              fulfillmentMode: staffFulfillment,
            }),
          });
        }
      } catch {
        await queueOrder({
          kind: meta.channel ? (mode as "takeaway" | "delivery") : "table",
          tableId: tableId ?? undefined,
          channel: meta.channel,
          customerName: payload.customerName,
          customerPhone: payload.customerPhone,
          orderNotes: payload.orderNotes,
          items: payload.items,
        });
        setSuccess("Offline — order queued and will sync when connection returns.");
        clearCart();
        setCartOpen(false);
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not place order");

      const chit = (json.kitchenChit ?? null) as KitchenChitPayload | null;
      if (chit) setLastChit(chit);

      const label =
        mode === "walkin" && selectedTable
          ? `Table ${selectedTable.number}`
          : meta.label;
      setSuccess(`Order #${json.order?.orderNumber ?? ""} sent to kitchen · ${label}`);
      clearCart();
      setCustomerPhone("");
      setOrderNotes("");
      setCartOpen(false);
      await loadTables();
      notifyFloorChanged();
      onOrderPlaced?.({ kitchenChit: chit });

      if ((alsoPrint || isSelf) && chit) {
        await printTicket(chit);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not place order");
    } finally {
      setPlacing(false);
    }
  };

  const handlePrint = async () => {
    if (lastChit && items.length === 0) {
      await printTicket(lastChit);
      return;
    }
    await placeOrder(true);
  };

  if (loadingTables) {
    return (
      <div className="py-16 flex justify-center">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  const modes = Object.keys(MODE_META) as OrderMode[];

  const cartProps = {
    items,
    total: total(),
    maxPrepTime: maxPrepTime(),
    placing,
    printing,
    onUpdateQuantity: updateQuantity,
    onUpdateNotes: updateNotes,
    onPlaceOrder: () => void placeOrder(isSelf),
    onClearCart: handleClearCart,
    onPrint: () => void handlePrint(),
    placeLabel: isSelf ? "Send & print" : "Send to kitchen",
  };

  const offlineBanner = (!online || pendingCount > 0) && (
    <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-sm text-amber-200 flex items-center justify-between gap-3">
      <span>
        {!online ? "Offline mode — orders queue locally." : `${pendingCount} order(s) waiting to sync.`}
      </span>
      {online && pendingCount > 0 && (
        <button type="button" className="underline" onClick={() => void syncPending()}>
          Sync now
        </button>
      )}
    </div>
  );

  const orderControls = (
    <div className="space-y-2">
      <ModePicker modes={modes} mode={mode} onChange={resetMode} compact />

      {meta.needsTable && (
        <div>
          {selectedTable && (
            <button
              type="button"
              onClick={() => setTablesOpen((open) => !open)}
              className="lg:hidden mb-1.5 inline-flex w-full items-center justify-between rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm font-semibold text-orange-900 dark:text-orange-100"
            >
              <span>Table {selectedTable.number}</span>
              <span className="text-xs font-medium text-muted">{tablesOpen ? "Hide tables" : "Change"}</span>
            </button>
          )}
          {!selectedTable ? (
            <p className="text-xs text-muted mb-1.5">Pick a table, then add items</p>
          ) : (
            <p className="hidden lg:block text-xs text-muted mb-1.5">Table {selectedTable.number}</p>
          )}
          <div
            className={cn(
              "flex gap-1.5 overflow-x-auto pb-0.5 lg:grid lg:grid-cols-8 lg:overflow-visible lg:gap-2",
              selectedTable && !tablesOpen && "hidden lg:grid",
            )}
          >
            {dineInTables.map((table) => {
              const floorState = states[table.id]?.state;
              const closed = !table.orderingEnabled && (!floorState || floorState === "available");
              const selected = tableId === table.id;
              return (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => {
                    setTable(table.id === tableId ? null : table.id);
                    if (table.id !== tableId) setTablesOpen(false);
                  }}
                  className={cn(
                    "h-10 w-11 shrink-0 rounded-xl border text-sm font-bold transition-colors lg:h-14 lg:w-auto",
                    closed
                      ? TABLE_CLOSED_STYLE
                      : FLOOR_STATE_STYLES[floorState ?? "available"] ?? FLOOR_STATE_STYLES.available,
                    selected && "ring-2 ring-orange-400 border-orange-400",
                  )}
                >
                  T{table.number}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2 min-w-0">
        {mode === "walkin" ? (
          <button
            type="button"
            onClick={() =>
              setStaffFulfillment((current) =>
                current === "SELF_PICKUP" ? "TABLE_SERVICE" : "SELF_PICKUP",
              )
            }
            className={cn(
              "inline-flex shrink-0 items-center justify-center px-2.5 py-2 rounded-xl border text-xs sm:text-sm font-semibold",
              isSelf
                ? "bg-sky-500/20 border-sky-500/40 text-sky-800 dark:text-sky-200"
                : "bg-orange-500/15 border-orange-500/40 text-orange-800 dark:text-orange-200",
            )}
          >
            {isSelf ? "Self" : "Table"}
          </button>
        ) : null}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <UserRound className="w-4 h-4 text-muted shrink-0" />
          <Input
            placeholder="Guest name"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="h-10 min-w-0"
          />
        </div>
      </div>
      {mode === "delivery" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input
            placeholder="Phone"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className="h-10 min-w-0"
          />
          <Input
            placeholder="Delivery address / notes"
            value={orderNotes}
            onChange={(e) => setOrderNotes(e.target.value)}
            className="h-10"
          />
        </div>
      )}
      {mode === "takeaway" && (
        <Input
          placeholder="Pickup notes (optional)"
          value={orderNotes}
          onChange={(e) => setOrderNotes(e.target.value)}
          className="h-10"
        />
      )}
      {isSelf ? (
        <p className="text-xs text-muted">
          Self tickets go to the kitchen and print a customer slip.
        </p>
      ) : null}
    </div>
  );

  const menuBlock = (
    <div className={cn("space-y-4", splitCart ? "pb-2" : "pb-28")}>
      {!splitCart ? (
        <>
          {offlineBanner}
          <div
            className={cn(
              "z-20 -mx-1 px-1 py-2 bg-app-shell/95 border-b border-[color:var(--surface-border)] lg:sticky lg:backdrop-blur-md",
              stickyClassName,
            )}
          >
            {orderControls}
          </div>
        </>
      ) : null}

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
          onOrder={() => setCartOpen(true)}
          ordering={placing}
          canOrder
          cart={cartControls}
          tapToSelect
          layout="dense"
          hideCheckout
        />
      )}

      {lastChit && cartCount === 0 && success ? (
        <div className="flex justify-end">
          <Button type="button" variant="secondary" size="sm" onClick={() => void printTicket(lastChit)}>
            <Printer className="w-4 h-4" />
            Print last ticket
          </Button>
        </div>
      ) : null}
    </div>
  );

  if (splitCart) {
    return (
      <div className="flex flex-col lg:flex-row gap-3 lg:gap-6 h-full min-h-0">
        <div className="min-w-0 flex-1 min-h-0 flex flex-col">
          {offlineBanner ? <div className="shrink-0 mb-2">{offlineBanner}</div> : null}
          <div className="shrink-0 pb-2 mb-2 border-b border-[color:var(--surface-border)]">
            {orderControls}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{menuBlock}</div>
        </div>
        <aside className="hidden lg:block w-[22rem] shrink-0 h-full overflow-y-auto">
          <StaffCartPanel {...cartProps} allowEmpty />
        </aside>
        <div className="lg:hidden shrink-0 border-t border-[color:var(--surface-border)] bg-app-shell px-1 pt-2 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          {cartCount === 0 ? (
            <p className="text-sm text-muted text-center py-2">Tap dishes to add them to the cart</p>
          ) : (
            <Button type="button" size="lg" className="w-full" onClick={() => setCartOpen(true)}>
              <ShoppingBag className="w-5 h-5" />
              Cart ({cartCount}) · {formatCurrency(total())}
            </Button>
          )}
        </div>
        <StaffCartDrawer
          open={cartOpen}
          onClose={() => setCartOpen(false)}
          {...cartProps}
        />
      </div>
    );
  }

  return (
    <>
      {menuBlock}
      {cartCount > 0 && !cartOpen ? (
        <div className="fixed bottom-24 lg:bottom-5 left-1/2 z-[85] -translate-x-1/2 max-w-[calc(100vw-2rem)]">
          <Button type="button" size="lg" onClick={() => setCartOpen(true)}>
            <ShoppingBag className="w-5 h-5" />
            View cart ({cartCount}) · {formatCurrency(total())}
          </Button>
        </div>
      ) : null}
      <StaffCartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        {...cartProps}
      />
    </>
  );
}

const MODE_SHORT: Record<OrderMode, string> = {
  walkin: "Walk-in",
  takeaway: "Takeaway",
  delivery: "Delivery",
};

function ModePicker({
  modes,
  mode,
  onChange,
  compact,
}: {
  modes: OrderMode[];
  mode: OrderMode;
  onChange: (mode: OrderMode) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn(compact ? "grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:gap-2" : "flex flex-wrap gap-2 mb-2")}>
      {modes.map((entry) => {
        const meta = MODE_META[entry];
        const Icon = meta.icon;
        const active = mode === entry;
        return (
          <button
            key={entry}
            type="button"
            onClick={() => onChange(entry)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl border font-medium transition-colors",
              compact ? "px-2 py-2 text-[11px] sm:px-3 sm:text-sm" : "px-3 py-2 text-sm",
              active
                ? "bg-violet-500/20 border-violet-500/40 text-violet-800 dark:text-violet-100"
                : "bg-white/5 border-white/10 text-muted hover:text-foreground",
            )}
          >
            <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">{compact ? MODE_SHORT[entry] : meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** @deprecated use RemoteOrdersPanel */
export const OfflineOrderPanel = RemoteOrdersPanel;

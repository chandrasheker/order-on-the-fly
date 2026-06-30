"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Phone, ShoppingBag, UserRound } from "lucide-react";
import { MenuView } from "@/components/customer/MenuView";
import { Button, Input, Spinner } from "@/components/ui";
import { cn, formatCurrency } from "@/lib/utils";
import { useStaffCartStore } from "@/store/staff-cart";

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

interface OfflineOrderPanelProps {
  onOrderPlaced?: () => void;
}

export function OfflineOrderPanel({ onOrderPlaced }: OfflineOrderPanelProps) {
  const [tables, setTables] = useState<TableRow[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loadingTables, setLoadingTables] = useState(true);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const {
    tableId,
    customerName,
    items,
    setTable,
    setCustomerName,
    addItem,
    updateQuantity,
    clearCart,
    total,
    maxPrepTime,
  } = useStaffCartStore();

  const selectedTable = useMemo(
    () => tables.find((table) => table.id === tableId) ?? null,
    [tables, tableId],
  );

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
      if (!res.ok) {
        throw new Error("Could not load menu");
      }
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
    if (tableId) {
      void loadMenu();
    }
  }, [tableId, loadMenu]);

  const cartControls = useMemo(
    () => ({
      items,
      addItem,
      updateQuantity,
      total,
      maxPrepTime,
    }),
    [items, addItem, updateQuantity, total, maxPrepTime],
  );

  const placeOrder = async () => {
    if (!tableId || items.length === 0) return;

    setPlacing(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/orders/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableId,
          customerName: customerName.trim() || undefined,
          items: items.map((item) => ({
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            notes: item.notes,
          })),
          openTable: true,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Could not place order");
      }

      const tableLabel = selectedTable ? `Table ${selectedTable.number}` : "table";
      setSuccess(`Order #${json.order?.orderNumber ?? ""} sent to kitchen for ${tableLabel}.`);
      clearCart();
      await loadTables();
      onOrderPlaced?.();
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

  if (!tableId) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-violet-500/20 flex items-center justify-center shrink-0">
              <Phone className="w-5 h-5 text-violet-300" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Take an offline order</h2>
              <p className="text-sm text-zinc-400 mt-1">
                When a guest calls or asks in person, pick their table and add items from the menu.
                The order goes straight to the kitchen like a QR order.
              </p>
            </div>
          </div>
        </div>

        <div>
          <p className="text-sm text-zinc-400 mb-3">Select table</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {tables.map((table) => (
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
                  {table.orderingEnabled
                    ? table.activeSessions > 0
                      ? `${table.activeSessions} guest online`
                      : "Open for ordering"
                    : "Closed · staff can still order"}
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
      <div className="sticky top-[4.5rem] z-20 -mx-1 px-1 py-3 bg-[#0a0a12]/95 backdrop-blur-md border-b border-white/5">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setTable(null)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-zinc-300 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" />
              Tables
            </button>
            <div>
              <p className="font-semibold text-white">Table {selectedTable?.number ?? "?"}</p>
              <p className="text-xs text-zinc-500">Offline order · sent to kitchen</p>
            </div>
          </div>

          <div className="flex items-center gap-2 min-w-[220px] flex-1 max-w-sm">
            <UserRound className="w-4 h-4 text-zinc-500 shrink-0" />
            <Input
              placeholder="Guest name (optional)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="h-10"
            />
          </div>
        </div>
      </div>

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
              : `Place order · ${items.reduce((sum, item) => sum + item.quantity, 0)} items`
          }
        />
      )}

      {items.length > 0 && (
        <div className="fixed bottom-4 right-4 z-40 hidden md:block">
          <div className="rounded-2xl border border-violet-500/30 bg-[#12121c]/95 backdrop-blur px-4 py-3 shadow-2xl min-w-[220px]">
            <div className="flex items-center gap-2 text-violet-300 text-sm font-medium mb-1">
              <ShoppingBag className="w-4 h-4" />
              Staff cart
            </div>
            <p className="text-white font-bold">{formatCurrency(total())}</p>
            <p className="text-xs text-zinc-500">~{maxPrepTime()} min prep</p>
            <Button
              className="w-full mt-3"
              disabled={placing}
              onClick={() => void placeOrder()}
            >
              {placing ? <Spinner /> : "Send to kitchen"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

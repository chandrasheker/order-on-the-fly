"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { MenuView } from "@/components/customer/MenuView";
import { OrderTracker } from "@/components/customer/OrderTracker";
import { WaitingGames } from "@/components/customer/WaitingGames";
import { Input, Button, Spinner } from "@/components/ui";
import { useCartStore } from "@/store/cart";
import { UtensilsCrossed, Sparkles } from "lucide-react";

interface Props {
  slug: string;
  token: string;
}

export function OrderPageClient({ slug, token }: Props) {
  const [data, setData] = useState<{
    restaurant: { name: string };
    table: { number: number };
    categories: Parameters<typeof MenuView>[0]["categories"];
  } | null>(null);
  const [orders, setOrders] = useState<Parameters<typeof OrderTracker>[0]["orders"]>([]);
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [showNameInput, setShowNameInput] = useState(true);
  const { customerName, setCustomerName, items, clearCart } = useCartStore();

  const fetchMenu = useCallback(async () => {
    const res = await fetch(`/api/menu/${slug}/${token}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [slug, token]);

  const fetchOrders = useCallback(async () => {
    const res = await fetch(`/api/orders?tableToken=${token}`);
    if (res.ok) {
      const json = await res.json();
      setOrders(json.orders);
    }
  }, [token]);

  useEffect(() => {
    fetchMenu();
    fetchOrders();
  }, [fetchMenu, fetchOrders]);

  const placeOrder = async () => {
    if (!items.length) return;
    setOrdering(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableToken: token,
          customerName: customerName || undefined,
          items: items.map((i) => ({
            menuItemId: i.menuItemId,
            quantity: i.quantity,
            notes: i.notes,
          })),
        }),
      });
      if (res.ok) {
        clearCart();
        setOrderPlaced(true);
        setTimeout(() => setOrderPlaced(false), 3000);
        fetchOrders();
      }
    } finally {
      setOrdering(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a]">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a] text-white">
        <p>Table not found. Please scan a valid QR code.</p>
      </div>
    );
  }

  const hasActiveOrders = orders.some((o) => o.status !== "SERVED");

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      {/* Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-600/20 via-rose-600/10 to-purple-600/20" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl" />
        <div className="relative px-4 pt-8 pb-6 max-w-lg mx-auto">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-sm text-orange-300 mb-3">
              <UtensilsCrossed className="w-4 h-4" />
              Table {data.table.number}
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
              {data.restaurant.name}
            </h1>
            <p className="text-sm text-zinc-400 mt-1 flex items-center justify-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              Scan · Order · Enjoy
            </p>
          </motion.div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 space-y-6">
        {/* Name input */}
        {showNameInput && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-4 rounded-2xl bg-white/5 border border-white/10"
          >
            <label className="text-sm text-zinc-400 mb-2 block">
              Your name (optional)
            </label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. Rahul"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
              <Button
                variant="secondary"
                onClick={() => setShowNameInput(false)}
              >
                OK
              </Button>
            </div>
          </motion.div>
        )}

        {/* Order success toast */}
        {orderPlaced && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-center font-medium"
          >
            🎉 Order placed! Kitchen is on it...
          </motion.div>
        )}

        {/* Active orders tracker */}
        {hasActiveOrders && (
          <OrderTracker
            orders={orders}
            tableToken={token}
            onRefresh={fetchOrders}
          />
        )}

        {/* Menu first — games below so menu is easy to scroll */}
        <MenuView
          categories={data.categories}
          onOrder={placeOrder}
          ordering={ordering}
        />

        {hasActiveOrders && <WaitingGames />}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { MenuView } from "@/components/customer/MenuView";
import { OrderTracker } from "@/components/customer/OrderTracker";
import { WaitingGames } from "@/components/customer/WaitingGames";
import { FeedbackButton } from "@/components/customer/FeedbackButton";
import { Input, Button, Spinner } from "@/components/ui";
import { useCartStore } from "@/store/cart";
import { useTableSession } from "@/hooks/useTableSession";
import { UtensilsCrossed, Sparkles, Users } from "lucide-react";

interface Props {
  slug: string;
  token: string;
}

interface LastOrder {
  id: string;
  total: number;
  orderNumber: number;
}

export function OrderPageClient({ slug, token }: Props) {
  const [data, setData] = useState<{
    restaurant: {
      name: string;
      rewardThresholdTea: number;
      rewardThresholdBeverage: number;
      rewardTeaLabel: string;
      rewardBeverageLabel: string;
    };
    table: { number: number };
    categories: Parameters<typeof MenuView>[0]["categories"];
  } | null>(null);
  const [orders, setOrders] = useState<Parameters<typeof OrderTracker>[0]["orders"]>([]);
  const [lastOrder, setLastOrder] = useState<LastOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [showNameInput, setShowNameInput] = useState(true);
  const [orderError, setOrderError] = useState("");
  const { customerName, setCustomerName, items, clearCart } = useCartStore();
  const tableSession = useTableSession(token);

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
    if (!items.length || !tableSession.active || !tableSession.sessionKey) return;
    setOrdering(true);
    setOrderError("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableToken: token,
          sessionKey: tableSession.sessionKey,
          customerName: customerName || undefined,
          items: items.map((i) => ({
            menuItemId: i.menuItemId,
            quantity: i.quantity,
            notes: i.notes,
          })),
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setLastOrder({
          id: json.order.id,
          total: json.order.total,
          orderNumber: json.order.orderNumber,
        });
        clearCart();
        setOrderPlaced(true);
        setTimeout(() => setOrderPlaced(false), 3000);
        fetchOrders();
      } else {
        const err = await res.json();
        setOrderError(err.error || "Could not place order");
      }
    } finally {
      setOrdering(false);
    }
  };

  if (loading || tableSession.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a]">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a] text-white p-6">
        <div className="text-center max-w-sm space-y-3">
          <p className="font-medium">Could not load this table&apos;s menu.</p>
          <p className="text-sm text-zinc-400">
            Try scanning the QR code again, or open{" "}
            <a href={`/order/${slug}/demo`} className="text-orange-400 underline">
              Table 1 demo
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  const hasActiveOrders = orders.some((o) =>
    o.items.some((i) => i.status !== "SERVED")
  );
  const latestOrderId = orders[0]?.id;
  const canOrder = tableSession.active;

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-600/20 via-rose-600/10 to-purple-600/20" />
        <div className="relative px-4 pt-8 pb-6 max-w-lg mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-sm text-orange-300 mb-3">
            <UtensilsCrossed className="w-4 h-4" />
            Table {data.table.number}
          </div>
          <h1 className="text-2xl font-bold">{data.restaurant.name}</h1>
          <p className="text-sm text-zinc-400 mt-1 flex items-center justify-center gap-1">
            <Sparkles className="w-3.5 h-3.5" />
            Scan · Order · Enjoy
          </p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 space-y-6 pb-8">
        {!canOrder && (
          <div className="p-4 rounded-2xl bg-red-500/15 border border-red-500/30 text-center space-y-3">
            <Users className="w-8 h-8 text-red-400 mx-auto" />
            <div>
              <p className="font-semibold text-red-300">Table is full for ordering</p>
              <p className="text-sm text-zinc-400 mt-1">
                This table allows {tableSession.maxSessions} active ordering session
                {tableSession.maxSessions === 1 ? "" : "s"} at a time (
                {tableSession.activeCount}/{tableSession.maxSessions} in use). You can browse the
                menu, but only the first {tableSession.maxSessions} scanned devices can place
                orders.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={tableSession.retry}>
              Check again
            </Button>
          </div>
        )}

        {showNameInput && canOrder && (
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
            <label className="text-sm text-zinc-400 mb-2 block">Your name (optional)</label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. Rahul"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
              <Button variant="secondary" onClick={() => setShowNameInput(false)}>
                OK
              </Button>
            </div>
          </div>
        )}

        {orderPlaced && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-center font-medium"
          >
            Order placed! Spin the wheel while you wait 🎡
          </motion.div>
        )}

        {orderError && (
          <p className="text-sm text-red-400 text-center">{orderError}</p>
        )}

        {hasActiveOrders && (
          <OrderTracker orders={orders} tableToken={token} onRefresh={fetchOrders} />
        )}

        {(hasActiveOrders || lastOrder) && canOrder && (
          <WaitingGames
            tableToken={token}
            customerName={customerName}
            lastOrder={lastOrder}
            rewardSettings={{
              rewardThresholdTea: data.restaurant.rewardThresholdTea,
              rewardThresholdBeverage: data.restaurant.rewardThresholdBeverage,
              rewardTeaLabel: data.restaurant.rewardTeaLabel,
              rewardBeverageLabel: data.restaurant.rewardBeverageLabel,
            }}
          />
        )}

        <MenuView
          categories={data.categories}
          onOrder={placeOrder}
          ordering={ordering}
          canOrder={canOrder}
        />
      </div>

      <FeedbackButton
        tableToken={token}
        customerName={customerName}
        orderId={latestOrderId}
      />
    </div>
  );
}

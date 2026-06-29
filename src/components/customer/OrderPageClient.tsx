"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MenuView } from "@/components/customer/MenuView";
import { OrderTracker } from "@/components/customer/OrderTracker";
import { OutOfStockNotice } from "@/components/customer/OutOfStockNotice";
import { WaitingGames } from "@/components/customer/WaitingGames";
import { FeedbackButton } from "@/components/customer/FeedbackButton";
import { Input, Button, Spinner } from "@/components/ui";
import { useCartStore } from "@/store/cart";
import { shouldShowCustomerOrder, shouldShowCustomerPaymentOrder, customerOrderBillTotal } from "@/lib/utils";
import { useTableSession } from "@/hooks/useTableSession";
import { UtensilsCrossed, Sparkles, Users, Heart, QrCode, ShieldAlert } from "lucide-react";
import Link from "next/link";

interface Props {
  slug: string;
  token: string;
}

interface RestaurantData {
  name: string;
  rewardThresholdTea: number;
  rewardThresholdBeverage: number;
  rewardTeaLabel: string;
  rewardBeverageLabel: string;
  backgroundImageUrl?: string | null;
  paymentQrUrl?: string | null;
}

function OrderPageBackground({ imageUrl }: { imageUrl?: string | null }) {
  if (!imageUrl) {
    return <div className="fixed inset-0 -z-20 bg-[#0f0f1a]" aria-hidden />;
  }

  return (
    <>
      <div
        className="fixed inset-0 -z-20 bg-cover bg-center bg-no-repeat scale-105"
        style={{ backgroundImage: `url(${imageUrl})` }}
        aria-hidden
      />
      <div
        className="fixed inset-0 -z-10 bg-gradient-to-b from-[#0f0f1a]/75 via-[#0f0f1a]/88 to-[#0f0f1a]/95 backdrop-blur-[1px]"
        aria-hidden
      />
    </>
  );
}

interface LastOrder {
  id: string;
  total: number;
  orderNumber: number;
}

export function OrderPageClient({ slug, token }: Props) {
  const [data, setData] = useState<{
    restaurant: RestaurantData;
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
  const [paymentBlocked, setPaymentBlocked] = useState(false);
  const [showThankYou, setShowThankYou] = useState(false);
  const trackedUnpaidOrderIds = useRef<Set<string>>(new Set());
  const thankYouTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { customerName, setCustomerName, items, clearCart } = useCartStore();
  const tableSession = useTableSession(token, slug);

  const fetchMenu = useCallback(async () => {
    const res = await fetch(`/api/menu/${slug}/${token}`);
    if (res.ok) {
      const json = await res.json();
      setData(json);
      setPaymentBlocked(Boolean(json.paymentBlocked));
    }
    setLoading(false);
  }, [slug, token]);

  const fetchOrders = useCallback(async () => {
    if (!tableSession.sessionKey) return;
    const res = await fetch(
      `/api/orders?tableToken=${encodeURIComponent(token)}&sessionKey=${encodeURIComponent(tableSession.sessionKey)}`,
      { credentials: "include" },
    );
    if (res.ok) {
      const json = await res.json();
      setOrders(json.orders ?? []);
      if (json.paymentBlocked !== undefined) {
        setPaymentBlocked(Boolean(json.paymentBlocked));
      }
    } else if (res.status === 403) {
      setOrders([]);
    }
  }, [token, tableSession.sessionKey]);

  useEffect(() => {
    if (tableSession.loading) return;
    fetchMenu();
    if (tableSession.diningVerified) {
      fetchOrders();
    }
  }, [fetchMenu, fetchOrders, tableSession.loading, tableSession.diningVerified]);

  useEffect(() => {
    if (!paymentBlocked) return;
    const interval = setInterval(fetchOrders, 3000);
    return () => clearInterval(interval);
  }, [paymentBlocked, fetchOrders]);

  useEffect(() => {
    let paymentConfirmed = false;

    for (const order of orders) {
      const isPaid = Boolean(order.paidAt);
      const wasTracked = trackedUnpaidOrderIds.current.has(order.id);
      const isUnpaidBill =
        order.status === "SERVED" &&
        !isPaid &&
        customerOrderBillTotal(order.items) > 0;

      if (wasTracked && isPaid) {
        paymentConfirmed = true;
      }

      if (isUnpaidBill) {
        trackedUnpaidOrderIds.current.add(order.id);
      } else if (isPaid) {
        trackedUnpaidOrderIds.current.delete(order.id);
      }
    }

    if (paymentConfirmed && !showThankYou) {
      setShowThankYou(true);
      setPaymentBlocked(false);
      setLastOrder(null);

      if (thankYouTimerRef.current) clearTimeout(thankYouTimerRef.current);
      thankYouTimerRef.current = setTimeout(() => {
        setShowThankYou(false);
        void fetchOrders();
        void fetchMenu();
        document.getElementById("customer-menu")?.scrollIntoView({ behavior: "smooth" });
      }, 5000);
    }
  }, [orders, showThankYou, fetchOrders, fetchMenu]);

  useEffect(() => {
    return () => {
      if (thankYouTimerRef.current) clearTimeout(thankYouTimerRef.current);
    };
  }, []);

  const placeOrder = async () => {
    if (!items.length || !tableSession.canOrder || !tableSession.sessionKey) return;
    setOrdering(true);
    setOrderError("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
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
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a] relative">
        {slug === "varanasi" && (
          <OrderPageBackground imageUrl="/restaurants/varanasi-hotel-background.jpg" />
        )}
        <Spinner className="w-8 h-8 relative z-10" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a] text-white p-6 relative">
        {slug === "varanasi" && (
          <OrderPageBackground imageUrl="/restaurants/varanasi-hotel-background.jpg" />
        )}
        <div className="text-center max-w-sm space-y-3 relative z-10">
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

  const hasActiveOrders = orders.some((o) => shouldShowCustomerOrder(o.items));
  const hasPaymentOrders = orders.some((o) => shouldShowCustomerPaymentOrder(o));
  const hasVisibleOrders = hasActiveOrders || hasPaymentOrders;
  const latestOrderId = orders[0]?.id;
  const canOrder = tableSession.canOrder && !paymentBlocked;
  const showOrderingGate = !canOrder && !paymentBlocked && !tableSession.loading;

  return (
    <div className="min-h-screen text-white relative">
      <OrderPageBackground imageUrl={data.restaurant.backgroundImageUrl} />

      <AnimatePresence>
        {showThankYou && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#0f0f1a]/95 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="max-w-sm w-full text-center rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/20 to-orange-500/10 p-8 shadow-2xl"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <Heart className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Thank you!</h2>
              <p className="text-emerald-300 font-medium mb-1">Payment confirmed</p>
              <p className="text-zinc-400 text-sm">
                We hope you enjoyed dining at {data.restaurant.name}. Please visit again!
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-600/15 via-transparent to-purple-600/10" />
        <div className="relative px-4 pt-8 pb-6 max-w-lg mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/20 text-sm text-orange-300 mb-3">
            <UtensilsCrossed className="w-4 h-4" />
            Table {data.table.number}
          </div>
          <h1 className="text-2xl font-bold drop-shadow-lg">{data.restaurant.name}</h1>
          <p className="text-sm text-zinc-300 mt-1 flex items-center justify-center gap-1 drop-shadow">
            <Sparkles className="w-3.5 h-3.5" />
            Scan · Order · Enjoy
          </p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 space-y-6 pb-8">
        {paymentBlocked && (
          <div className="p-4 rounded-2xl bg-yellow-500/15 border border-yellow-500/30 text-center space-y-2">
            <p className="font-semibold text-yellow-300">Table locked — payment pending</p>
            <p className="text-sm text-zinc-400">
              Complete payment for your current bill before ordering more. Staff will confirm once
              payment is received.
            </p>
          </div>
        )}

        {showOrderingGate && (
          <div className="p-4 rounded-2xl bg-red-500/15 border border-red-500/30 text-center space-y-3">
            {!tableSession.orderingEnabled ? (
              <>
                <ShieldAlert className="w-8 h-8 text-amber-400 mx-auto" />
                <div>
                  <p className="font-semibold text-amber-300">Ordering not open yet</p>
                  <p className="text-sm text-zinc-400 mt-1">
                    {tableSession.gateMessage ||
                      "Please ask your server to enable ordering when you are seated at this table."}
                  </p>
                </div>
              </>
            ) : !tableSession.diningVerified ? (
              <>
                <QrCode className="w-8 h-8 text-red-400 mx-auto" />
                <div>
                  <p className="font-semibold text-red-300">Scan the QR at your table</p>
                  <p className="text-sm text-zinc-400 mt-1">
                    {tableSession.gateMessage ||
                      "Saved links cannot be used to order remotely. Scan the QR code on your table to verify you are dining here."}
                  </p>
                </div>
                <Link
                  href={tableSession.checkInPath}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm text-white"
                >
                  Scan / check in again
                </Link>
              </>
            ) : (
              <>
                <Users className="w-8 h-8 text-red-400 mx-auto" />
                <div>
                  <p className="font-semibold text-red-300">Session unavailable</p>
                  <p className="text-sm text-zinc-400 mt-1">
                    {tableSession.gateMessage ||
                      "Your table session expired or this table is full. Scan the QR code again."}
                  </p>
                </div>
                <Link
                  href={tableSession.checkInPath}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm text-white"
                >
                  Scan QR again
                </Link>
              </>
            )}
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

        {!showThankYou && (
          <OutOfStockNotice
            orders={orders}
            tableToken={token}
            onDismissed={fetchOrders}
          />
        )}

        {hasVisibleOrders && !showThankYou && (
          <OrderTracker
            orders={orders}
            tableToken={token}
            paymentQrUrl={data.restaurant.paymentQrUrl}
            onRefresh={fetchOrders}
            onPaymentRequested={() => setPaymentBlocked(true)}
          />
        )}

        {(hasVisibleOrders || lastOrder) && canOrder && !showThankYou && (
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

        <div id="customer-menu">
          <MenuView
            categories={data.categories}
            onOrder={placeOrder}
            ordering={ordering}
            canOrder={canOrder && !showThankYou}
          />
        </div>
      </div>

      <FeedbackButton
        tableToken={token}
        customerName={customerName}
        orderId={latestOrderId}
      />
    </div>
  );
}

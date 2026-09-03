"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MenuView } from "@/components/customer/MenuView";
import { OrderTracker } from "@/components/customer/OrderTracker";
import { OutOfStockNotice } from "@/components/customer/OutOfStockNotice";
import { TableSwitchRequest } from "@/components/customer/TableSwitchRequest";
import { WaitingGames } from "@/components/customer/WaitingGames";
import { FeedbackButton } from "@/components/customer/FeedbackButton";
import { Input, Button, Spinner } from "@/components/ui";
import { useCartStore } from "@/store/cart";
import { useCartDraftSync } from "@/hooks/useCartDraftSync";
import { shouldShowCustomerOrder, shouldShowCustomerPaymentOrder, customerOrderBillTotal } from "@/lib/utils";
import { useTableSession } from "@/hooks/useTableSession";
import { UtensilsCrossed, Sparkles, Users, Heart, QrCode, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { CallWaiterBar } from "@/components/customer/CallWaiterBar";
import { KitchenPausedBanner } from "@/components/customer/KitchenPausedBanner";
import { PromoCodeInput } from "@/components/customer/PromoCodeInput";
import { ComboMealsSection } from "@/components/customer/ComboMealsSection";
import { CustomerPageBackground } from "@/components/customer/CustomerPageBackground";
import { isClientOffline, isNetworkFetchError } from "@/lib/client-fetch";

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
  upiVpa?: string | null;
  upiMerchantName?: string | null;
  automaticUpiEnabled?: boolean;
}

interface MenuFeatures {
  promotions?: boolean;
  modifiers?: boolean;
  callWaiter?: boolean;
  kitchenCapacity?: boolean;
}

interface ComboMeal {
  id: string;
  name: string;
  description: string | null;
  comboPrice: number;
  items: Array<{
    menuItem: { id: string; name: string; price: number; isAvailable: boolean };
    quantity: number;
  }>;
}

interface LastOrder {
  id: string;
  total: number;
  orderNumber: number;
}

export function OrderPageClient({ slug, token }: Props) {
  const [data, setData] = useState<{
    restaurant: RestaurantData;
    table: { id: string; number: number };
    categories: Parameters<typeof MenuView>[0]["categories"];
    features?: MenuFeatures;
    kitchenPaused?: boolean;
    kitchenPauseMessage?: string | null;
    combos?: ComboMeal[];
  } | null>(null);
  const [comboCart, setComboCart] = useState<Array<{ comboMealId: string; quantity: number }>>([]);
  const [orders, setOrders] = useState<Parameters<typeof OrderTracker>[0]["orders"]>([]);
  const [lastOrder, setLastOrder] = useState<LastOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [showNameInput, setShowNameInput] = useState(true);
  const [orderError, setOrderError] = useState("");
  const [tabPaymentPending, setTabPaymentPending] = useState(false);
  const [tabRemaining, setTabRemaining] = useState<number | null>(null);
  const [showThankYou, setShowThankYou] = useState(false);
  const trackedUnpaidOrderIds = useRef<Set<string>>(new Set());
  const thankYouTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuAbortRef = useRef<AbortController | null>(null);
  const ordersAbortRef = useRef<AbortController | null>(null);
  const { customerName, setCustomerName, items, promoCode, setPromoCode, clearCart } = useCartStore();
  const tableSession = useTableSession(token, slug);

  useCartDraftSync({
    enabled: tableSession.diningVerified && Boolean(data?.table.id),
    source: "CUSTOMER",
    tableToken: token,
    tableId: data?.table.id,
    sessionKey: tableSession.sessionKey,
    items,
  });

  const fetchMenu = useCallback(async () => {
    if (isClientOffline()) {
      setLoading(false);
      return;
    }

    menuAbortRef.current?.abort();
    const controller = new AbortController();
    menuAbortRef.current = controller;

    try {
      const res = await fetch(`/api/menu/${slug}/${token}`, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json();
        setData({
          restaurant: json.restaurant,
          table: json.table,
          categories: json.categories,
          features: json.features,
          kitchenPaused: json.kitchenPaused,
          kitchenPauseMessage: json.kitchenPauseMessage,
          combos: json.combos,
        });
        setTabPaymentPending(Boolean(json.tabPaymentPending ?? json.paymentBlocked));
      }
    } catch (error) {
      if (isNetworkFetchError(error)) return;
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [slug, token]);

  const fetchOrders = useCallback(async () => {
    if (!tableSession.sessionKey) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    ordersAbortRef.current?.abort();
    const controller = new AbortController();
    ordersAbortRef.current = controller;

    try {
      const res = await fetch(
        `/api/orders?tableToken=${encodeURIComponent(token)}&sessionKey=${encodeURIComponent(tableSession.sessionKey)}`,
        { credentials: "include", signal: controller.signal, cache: "no-store" },
      );
      if (res.ok) {
        const json = await res.json();
        setOrders(json.orders ?? []);
        if (json.tabPaymentPending !== undefined || json.paymentBlocked !== undefined) {
          setTabPaymentPending(Boolean(json.tabPaymentPending ?? json.paymentBlocked));
        }
        if (typeof json.tabSummary?.remaining === "number" && Number.isFinite(json.tabSummary.remaining)) {
          setTabRemaining(json.tabSummary.remaining);
        } else {
          setTabRemaining(null);
        }
      } else if (res.status === 403) {
        setOrders([]);
      }
    } catch (error) {
      if (isNetworkFetchError(error)) return;
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
    if (!tabPaymentPending) return;
    const interval = setInterval(fetchOrders, 3000);
    return () => clearInterval(interval);
  }, [tabPaymentPending, fetchOrders]);

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
      setTabPaymentPending(false);
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
      menuAbortRef.current?.abort();
      ordersAbortRef.current?.abort();
    };
  }, []);

  const placeOrder = async () => {
    if ((!items.length && !comboCart.length) || !tableSession.canOrder || !tableSession.sessionKey) return;
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
          promoCode: promoCode || undefined,
          items: items.map((i) => ({
            menuItemId: i.menuItemId,
            quantity: i.quantity,
            notes: i.notes,
            modifierOptionIds: i.modifierOptionIds,
          })),
          comboMeals: comboCart,
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
        setComboCart([]);
        setOrderPlaced(true);
        setTimeout(() => setOrderPlaced(false), 3000);
        fetchOrders();
      } else {
        const err = await res.json();
        if (err.code === "INVALID_PROMO") {
          setPromoCode("");
        }
        setOrderError(err.error || "Could not place order");
      }
    } catch {
      setOrderError("Network error — check your connection and try again.");
    } finally {
      setOrdering(false);
    }
  };

  const addCombo = (comboMealId: string) => {
    setComboCart((prev) => {
      const existing = prev.find((c) => c.comboMealId === comboMealId);
      if (existing) {
        return prev.map((c) =>
          c.comboMealId === comboMealId ? { ...c, quantity: c.quantity + 1 } : c,
        );
      }
      return [...prev, { comboMealId, quantity: 1 }];
    });
  };

  if (loading || tableSession.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-customer-shell relative">
        <Spinner className="w-8 h-8 relative z-10" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-customer-shell text-foreground p-6 relative">
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
  const canOrder = tableSession.canOrder && !data?.kitchenPaused;
  const showOrderingGate =
    !canOrder &&
    !tabPaymentPending &&
    !tableSession.loading &&
    !tableSession.canTrackExistingOrder &&
    !hasVisibleOrders;

  return (
    <div className="min-h-screen text-white relative">
      <CustomerPageBackground imageUrl={data.restaurant.backgroundImageUrl} />

      <AnimatePresence>
        {showThankYou && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-customer-shell/95 backdrop-blur-md"
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
        {tabPaymentPending && (
          <div className="p-4 rounded-2xl bg-yellow-500/15 border border-yellow-500/30 text-center space-y-2">
            <p className="font-semibold text-yellow-300">Payment pending</p>
            <p className="text-sm text-zinc-400">
              Staff is confirming your bill. You can still order more — new items will be added to
              the same table bill until payment is complete.
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

        {data.features?.kitchenCapacity && (
          <KitchenPausedBanner
            paused={Boolean(data.kitchenPaused)}
            message={data.kitchenPauseMessage}
          />
        )}

        {data.features?.callWaiter && tableSession.diningVerified && (
          <CallWaiterBar
            tableToken={token}
            sessionKey={tableSession.sessionKey}
            enabled={Boolean(data.features.callWaiter)}
          />
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
            upiVpa={data.restaurant.upiVpa}
            upiMerchantName={data.restaurant.upiMerchantName}
            automaticUpiEnabled={data.restaurant.automaticUpiEnabled}
            tabRemaining={tabRemaining}
            onRefresh={fetchOrders}
            onPaymentRequested={() => setTabPaymentPending(true)}
          />
        )}

        {hasVisibleOrders && !showThankYou && (
          <TableSwitchRequest
            slug={slug}
            tableToken={token}
            sessionKey={tableSession.sessionKey}
            customerName={customerName}
            enabled={tableSession.diningVerified}
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

        {data.features?.promotions && canOrder && !showThankYou && (
          <PromoCodeInput enabled={Boolean(data.features.promotions)} />
        )}

        {data.features?.promotions && (data.combos?.length ?? 0) > 0 && !showThankYou && (
          <ComboMealsSection
            combos={data.combos ?? []}
            canOrder={canOrder}
            onAddCombo={addCombo}
          />
        )}

        {comboCart.length > 0 && (
          <p className="text-sm text-center text-orange-300">
            {comboCart.length} combo{comboCart.length > 1 ? "s" : ""} ready to order
          </p>
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

"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { buildUpiIntents, isValidUpiVpa } from "@/lib/upi-intent";
import { RAZORPAY_CHECKOUT_SCRIPT } from "@/lib/gateway-constants";
import { CircleDollarSign, QrCode, Smartphone, X } from "lucide-react";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

interface PaymentModalProps {
  orderId?: string;
  tableToken?: string;
  orderNumber: number;
  billTotal: number | null;
  consolidated?: boolean;
  paymentQrUrl?: string | null;
  upiVpa?: string | null;
  upiMerchantName?: string | null;
  automaticUpiEnabled?: boolean;
  paymentReference?: string;
  onClose: () => void;
  onConfirm: () => void;
  confirming: boolean;
  onRefreshAmount?: () => void;
  onPaid?: (receiptUrl?: string | null) => void;
}

type GatewayPhase =
  | "idle"
  | "preparing"
  | "waiting"
  | "verifying"
  | "success"
  | "failed"
  | "cancelled"
  | "processing";

function loadRazorpayScript() {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("unavailable"));
      return;
    }
    if (window.Razorpay) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${RAZORPAY_CHECKOUT_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("script")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = RAZORPAY_CHECKOUT_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("script"));
    document.body.appendChild(script);
  });
}

export function PaymentModal({
  orderId,
  tableToken,
  orderNumber,
  billTotal,
  consolidated = false,
  paymentQrUrl,
  upiVpa,
  upiMerchantName,
  automaticUpiEnabled = false,
  paymentReference,
  onClose,
  onConfirm,
  confirming,
  onRefreshAmount,
  onPaid,
}: PaymentModalProps) {
  const [showQr, setShowQr] = useState(false);
  const [phase, setPhase] = useState<GatewayPhase>("idle");
  const [gatewayMessage, setGatewayMessage] = useState("");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const hasQr = Boolean(paymentQrUrl?.trim());
  const amountReady = billTotal != null && Number.isFinite(billTotal) && billTotal > 0;
  const hasVpa = isValidUpiVpa(upiVpa);
  const useRazorpay = automaticUpiEnabled && !consolidated && Boolean(orderId && tableToken);
  const intents = useMemo(() => {
    if (useRazorpay || !amountReady || consolidated || !hasVpa || !upiVpa || billTotal == null) {
      return null;
    }
    return buildUpiIntents({
      vpa: upiVpa,
      payeeName: upiMerchantName || "Restaurant",
      amount: billTotal,
      transactionRef: (paymentReference ?? `BILL${orderNumber}`).slice(0, 35),
      note: `Order ${orderNumber}`,
    });
  }, [useRazorpay, amountReady, consolidated, hasVpa, upiVpa, upiMerchantName, billTotal, paymentReference, orderNumber]);

  const pollStatus = async (publicToken: string) => {
    for (let i = 0; i < 8; i += 1) {
      const res = await fetch(`/api/payments/gateway/${publicToken}`);
      const json = await res.json().catch(() => ({}));
      if (json.status?.paid) {
        setPhase("success");
        setGatewayMessage("Payment successful.");
        setReceiptUrl(json.status.receiptUrl ?? null);
        onPaid?.(json.status.receiptUrl ?? null);
        return;
      }
      if (json.status?.retryable) {
        setPhase("failed");
        setGatewayMessage(json.status.message || "Payment could not be completed. You can retry.");
        return;
      }
      setPhase("processing");
      setGatewayMessage("Payment is being verified. Please don't pay again yet.");
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    setPhase("processing");
    setGatewayMessage("Payment is being verified. Please don't pay again yet.");
  };

  const startRazorpay = async () => {
    if (!orderId || !tableToken || !amountReady) return;
    setPhase("preparing");
    setGatewayMessage("Preparing payment");
    try {
      const res = await fetch("/api/payments/gateway/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, tableToken }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.checkout?.orderId) {
        setPhase("failed");
        setGatewayMessage(json.error || "Payment could not be completed. You can retry.");
        return;
      }
      await loadRazorpayScript();
      if (!window.Razorpay) {
        setPhase("failed");
        setGatewayMessage("Payment could not be completed. You can retry.");
        return;
      }
      setPhase("waiting");
      setGatewayMessage("Waiting for payment");
      const checkout = json.checkout;
      const rzp = new window.Razorpay({
        key: checkout.keyId,
        amount: checkout.amountPaise,
        currency: checkout.currency,
        name: checkout.name,
        order_id: checkout.orderId,
        handler: async (response: {
          razorpay_payment_id?: string;
          razorpay_signature?: string;
        }) => {
          setPhase("verifying");
          setGatewayMessage("Payment is being verified. Please don't pay again yet.");
          try {
            const verifyRes = await fetch("/api/payments/gateway/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                publicToken: checkout.publicToken,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const verifyJson = await verifyRes.json().catch(() => ({}));
            if (verifyRes.ok && verifyJson.paid) {
              await pollStatus(checkout.publicToken);
              return;
            }
            if (verifyRes.status >= 500) {
              setPhase("processing");
              setGatewayMessage("Payment is being verified. Please don't pay again yet.");
              await pollStatus(checkout.publicToken);
              return;
            }
            setPhase("failed");
            setGatewayMessage(verifyJson.error || "Payment could not be completed. You can retry.");
          } catch {
            setPhase("processing");
            setGatewayMessage("Payment is being verified. Please don't pay again yet.");
            await pollStatus(checkout.publicToken);
          }
        },
        modal: {
          ondismiss: () => {
            void fetch(`/api/payments/gateway/${checkout.publicToken}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "cancel" }),
            });
            setPhase("cancelled");
            setGatewayMessage("Payment cancelled. You have not been charged by TableTap.");
          },
        },
      });
      rzp.open();
    } catch {
      setPhase("processing");
      setGatewayMessage("Payment is being verified. Please don't pay again yet.");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-sm rounded-2xl bg-[#14141f] border border-emerald-500/30 p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wide">
              {consolidated ? "Combined table bill" : `Order #${orderNumber}`}
            </p>
            <h3 className="text-xl font-bold text-white mt-1">
              {amountReady
                ? useRazorpay
                  ? `Pay securely ${formatCurrency(billTotal!)}`
                  : `Pay ${formatCurrency(billTotal!)}`
                : "Refreshing bill total…"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {consolidated && amountReady ? (
          <p className="text-xs text-amber-200 mb-4">
            Please ask staff to settle the combined table bill.
          </p>
        ) : null}

        {useRazorpay && gatewayMessage ? (
          <p className={`text-sm mb-4 ${phase === "success" ? "text-emerald-300" : phase === "failed" || phase === "cancelled" ? "text-amber-200" : "text-zinc-300"}`}>
            {gatewayMessage}
          </p>
        ) : null}

        {phase === "success" && receiptUrl ? (
          <a
            href={receiptUrl}
            className="block w-full mb-4 rounded-xl bg-emerald-600 px-3 py-3 text-center text-sm font-medium text-white"
          >
            View receipt
          </a>
        ) : null}

        {intents ? (
          <div className="space-y-3 mb-4">
            <p className="text-sm text-zinc-300">Pay with a UPI app on this phone</p>
            <div className="grid grid-cols-2 gap-2">
              <a href={intents.gpay} className="rounded-xl bg-white/10 px-3 py-3 text-center text-sm text-white">
                Google Pay
              </a>
              <a href={intents.phonepe} className="rounded-xl bg-white/10 px-3 py-3 text-center text-sm text-white">
                PhonePe
              </a>
              <a href={intents.paytm} className="rounded-xl bg-white/10 px-3 py-3 text-center text-sm text-white">
                Paytm
              </a>
              <a href={intents.generic} className="rounded-xl bg-white/10 px-3 py-3 text-center text-sm text-white">
                Other UPI app
              </a>
            </div>
            <p className="text-xs text-amber-200">Staff must verify the payment.</p>
          </div>
        ) : null}

        {(hasQr || !intents) && !useRazorpay && (
          <>
            {hasQr && (showQr || !intents) ? (
              <>
                <div className="rounded-2xl bg-white p-4 mb-4">
                  <img
                    src={paymentQrUrl!}
                    alt="UPI payment QR code"
                    className="w-full max-w-[220px] mx-auto aspect-square object-contain"
                  />
                </div>
                <div className="flex items-start gap-2 text-sm text-zinc-300 mb-4">
                  <Smartphone className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <p>
                    Scan this QR from another phone and pay{" "}
                    <strong className="text-emerald-400">
                      {amountReady ? formatCurrency(billTotal!) : "the billed amount"}
                    </strong>
                  </p>
                </div>
              </>
            ) : hasQr ? (
              <button
                type="button"
                onClick={() => setShowQr(true)}
                className="w-full mb-4 rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-300 flex items-center justify-center gap-2"
              >
                <QrCode className="w-4 h-4" /> Show QR for another phone
              </button>
            ) : !intents && !consolidated ? (
              <div className="p-4 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-100 text-sm mb-4">
                <p className="font-medium">Pay cash at the table</p>
                <p className="text-amber-200/80 text-xs mt-1">
                  Online UPI is not set up. Alert your server to collect cash.
                </p>
              </div>
            ) : null}
          </>
        )}

        {phase !== "success" ? (
          <Button
            variant="success"
            className="w-full bg-emerald-600 hover:bg-emerald-500 mb-2"
            disabled={
              confirming ||
              phase === "preparing" ||
              phase === "waiting" ||
              phase === "verifying" ||
              (!amountReady && !onRefreshAmount)
            }
            onClick={
              !amountReady
                ? onRefreshAmount
                : useRazorpay
                  ? () => void startRazorpay()
                  : onConfirm
            }
          >
            <CircleDollarSign className="w-4 h-4" />
            {confirming || phase === "preparing" || phase === "verifying"
              ? phase === "verifying"
                ? "Verifying payment…"
                : useRazorpay
                  ? "Preparing payment…"
                  : "Notifying staff..."
              : !amountReady
                ? "Refresh bill total"
                : useRazorpay
                  ? `Pay securely ${formatCurrency(billTotal!)}`
                  : intents
                    ? "I've paid — staff will verify"
                    : `Pay ${formatCurrency(billTotal!)} — alert server`}
          </Button>
        ) : null}
        <p className="text-xs text-zinc-500 text-center">
          This screen never marks payment successful by itself.
        </p>
      </motion.div>
    </motion.div>
  );
}

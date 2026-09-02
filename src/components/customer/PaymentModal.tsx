"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { buildUpiIntents, isValidUpiVpa } from "@/lib/upi-intent";
import { CircleDollarSign, QrCode, Smartphone, X } from "lucide-react";

interface PaymentModalProps {
  orderNumber: number;
  billTotal: number;
  consolidated?: boolean;
  paymentQrUrl?: string | null;
  upiVpa?: string | null;
  upiMerchantName?: string | null;
  automaticUpiEnabled?: boolean;
  paymentReference?: string;
  onClose: () => void;
  onConfirm: () => void;
  confirming: boolean;
}

export function PaymentModal({
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
}: PaymentModalProps) {
  const [showQr, setShowQr] = useState(false);
  const hasQr = Boolean(paymentQrUrl?.trim());
  const hasVpa = isValidUpiVpa(upiVpa);
  const intents = useMemo(() => {
    if (!hasVpa || !upiVpa) return null;
    return buildUpiIntents({
      vpa: upiVpa,
      payeeName: upiMerchantName || "Restaurant",
      amount: billTotal,
      transactionRef: (paymentReference ?? `BILL${orderNumber}`).slice(0, 35),
      note: consolidated ? "Table bill" : `Order ${orderNumber}`,
    });
  }, [hasVpa, upiVpa, upiMerchantName, billTotal, paymentReference, orderNumber, consolidated]);

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
              Pay {formatCurrency(billTotal)}
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
            {automaticUpiEnabled ? (
              <p className="text-xs text-emerald-300">
                After you pay, wait here. Payment is confirmed by the bank, not by this screen.
              </p>
            ) : (
              <p className="text-xs text-amber-200">
                Opening a UPI app does not mark this bill paid. Staff must verify the payment.
              </p>
            )}
          </div>
        ) : null}

        {(hasQr || !intents) && (
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
                    <strong className="text-emerald-400">{formatCurrency(billTotal)}</strong>
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
            ) : !intents ? (
              <div className="p-4 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-100 text-sm mb-4">
                <p className="font-medium">Pay cash at the table</p>
                <p className="text-amber-200/80 text-xs mt-1">
                  Online UPI is not set up. Alert your server to collect cash.
                </p>
              </div>
            ) : null}
          </>
        )}

        <Button
          variant="success"
          className="w-full bg-emerald-600 hover:bg-emerald-500 mb-2"
          disabled={confirming}
          onClick={onConfirm}
        >
          <CircleDollarSign className="w-4 h-4" />
          {confirming
            ? "Notifying staff..."
            : intents
              ? "I've paid — staff will verify"
              : `Pay ${formatCurrency(billTotal)} — alert server`}
        </Button>
        <p className="text-xs text-zinc-500 text-center">
          This screen never marks payment successful by itself.
        </p>
      </motion.div>
    </motion.div>
  );
}

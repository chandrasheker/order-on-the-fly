"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { CircleDollarSign, X, Smartphone } from "lucide-react";

interface PaymentModalProps {
  orderNumber: number;
  billTotal: number;
  paymentQrUrl?: string | null;
  onClose: () => void;
  onConfirm: () => void;
  confirming: boolean;
}

export function PaymentModal({
  orderNumber,
  billTotal,
  paymentQrUrl,
  onClose,
  onConfirm,
  confirming,
}: PaymentModalProps) {
  const hasQr = Boolean(paymentQrUrl?.trim());

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
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Order #{orderNumber}</p>
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

        {hasQr ? (
          <>
            <div className="rounded-2xl bg-white p-4 mb-4">
              <img
                src={paymentQrUrl!}
                alt="PhonePe payment QR code"
                className="w-full max-w-[220px] mx-auto aspect-square object-contain"
              />
            </div>
            <div className="flex items-start gap-2 text-sm text-zinc-300 mb-4">
              <Smartphone className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <p>
                Open <strong className="text-white">PhonePe</strong> → Scan QR → Pay{" "}
                <strong className="text-emerald-400">{formatCurrency(billTotal)}</strong>
              </p>
            </div>
            <Button
              variant="success"
              className="w-full bg-emerald-600 hover:bg-emerald-500 mb-2"
              disabled={confirming}
              onClick={onConfirm}
            >
              <CircleDollarSign className="w-4 h-4" />
              {confirming ? "Notifying staff..." : "I've paid — notify staff"}
            </Button>
            <p className="text-xs text-zinc-500 text-center">
              Staff will verify your payment and confirm. This table stays locked until then.
            </p>
          </>
        ) : (
          <>
            <div className="p-4 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-100 text-sm mb-4">
              <p className="font-medium">Pay with staff at the table</p>
              <p className="text-amber-200/80 text-xs mt-1">
                Online QR is not set up yet. Tap below to alert your server — they will collect
                payment offline and confirm your bill.
              </p>
            </div>
            <Button
              variant="success"
              className="w-full bg-emerald-600 hover:bg-emerald-500 mb-2"
              disabled={confirming}
              onClick={onConfirm}
            >
              <CircleDollarSign className="w-4 h-4" />
              {confirming ? "Alerting server..." : `Pay ${formatCurrency(billTotal)} — alert server`}
            </Button>
            <p className="text-xs text-zinc-500 text-center">
              New orders are blocked on this table until staff marks your bill as paid.
            </p>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

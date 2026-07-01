"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { CircleDollarSign, Split, ChevronDown, ChevronUp } from "lucide-react";
import type { ReceiptPayload } from "@/lib/receipt-service";
import { swallowPollingFetchError } from "@/lib/client-fetch";

type PaymentItem = {
  id: string;
  itemName: string;
  quantity: number;
  status: string;
  lineTotal: number;
  paid: number;
  remaining: number;
};

type PaymentSummary = {
  total: number;
  paid: number;
  remaining: number;
  fullyPaid: boolean;
  items: PaymentItem[];
  payments: Array<{
    id: string;
    amount: number;
    method: string;
    collectedByName: string | null;
    createdAt: string;
  }>;
};

interface SplitPaymentPanelProps {
  orderId: string;
  orderNumber: number;
  tableNumber: number;
  summary?: PaymentSummary | null;
  onPaymentComplete: (
    res: Response,
    json: { error?: string; receipt?: ReceiptPayload },
  ) => Promise<void>;
}

export function SplitPaymentPanel({
  orderId,
  summary,
  onPaymentComplete,
}: SplitPaymentPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [splitCount, setSplitCount] = useState(2);
  const [method, setMethod] = useState<"UPI" | "CASH" | "CARD">("UPI");
  const [busy, setBusy] = useState(false);

  if (!summary || summary.remaining <= 0) return null;

  const payableItems = summary.items.filter((item) => item.remaining > 0);

  const selectedTotal = payableItems
    .filter((item) => selectedItems.has(item.id))
    .reduce((sum, item) => sum + item.remaining, 0);

  const splitAmount = Math.ceil(summary.remaining / Math.max(1, splitCount));

  const toggleItem = (id: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitPayment = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      setSelectedItems(new Set());
      await onPaymentComplete(res, json);
    } catch (error) {
      swallowPollingFetchError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {summary.paid > 0 && (
        <p className="text-xs text-emerald-400">
          {formatCurrency(summary.paid)} paid · {formatCurrency(summary.remaining)} remaining
        </p>
      )}

      <Button
        variant="success"
        size="sm"
        className="w-full bg-emerald-600 hover:bg-emerald-500"
        disabled={busy}
        onClick={() => void submitPayment({ action: "mark-paid", method })}
      >
        <CircleDollarSign className="w-4 h-4" /> Pay full {formatCurrency(summary.remaining)}
      </Button>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-center gap-1 text-xs text-zinc-400 hover:text-white py-1"
      >
        <Split className="w-3 h-3" /> Split bill
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-3">
          <div>
            <p className="text-xs text-zinc-500 mb-2">Pay by item</p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {payableItems.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center justify-between gap-2 text-sm cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedItems.has(item.id)}
                      onChange={() => toggleItem(item.id)}
                      className="rounded"
                    />
                    <span className="text-zinc-300">
                      {item.quantity}x {item.itemName}
                    </span>
                  </span>
                  <span className="text-zinc-400">{formatCurrency(item.remaining)}</span>
                </label>
              ))}
            </div>
            {selectedItems.size > 0 && (
              <Button
                variant="secondary"
                size="sm"
                className="w-full mt-2"
                disabled={busy}
                onClick={() =>
                  void submitPayment({
                    action: "record-payment",
                    amount: selectedTotal,
                    method,
                    itemIds: Array.from(selectedItems),
                  })
                }
              >
                Pay selected {formatCurrency(selectedTotal)}
              </Button>
            )}
          </div>

          <div className="border-t border-white/10 pt-3">
            <p className="text-xs text-zinc-500 mb-2">Split evenly</p>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                min={2}
                max={10}
                value={splitCount}
                onChange={(e) => setSplitCount(parseInt(e.target.value, 10) || 2)}
                className="w-16 rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-sm"
              />
              <span className="text-sm text-zinc-400">ways → {formatCurrency(splitAmount)} each</span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="w-full mt-2"
              disabled={busy}
              onClick={() =>
                void submitPayment({
                  action: "record-payment",
                  amount: splitAmount,
                  method,
                })
              }
            >
              Record 1/{splitCount} share ({formatCurrency(splitAmount)})
            </Button>
          </div>

          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
            className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs"
          >
            <option value="UPI">UPI / PhonePe</option>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
          </select>

          {summary.payments.length > 0 && (
            <div className="text-xs text-zinc-500 space-y-1">
              {summary.payments.map((p) => (
                <div key={p.id}>
                  {formatCurrency(p.amount)} · {p.method}
                  {p.collectedByName ? ` · ${p.collectedByName}` : ""}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

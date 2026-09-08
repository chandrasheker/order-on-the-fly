"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Spinner } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { fromPaise } from "@/lib/money";
import { Lock, RefreshCw } from "lucide-react";

type QueueRow = {
  id: string;
  pickupNumber: number;
  pickupCode: string | null;
  tableNumber: number;
  outstandingAmountPaise: number;
  paid: boolean;
  collectable: boolean;
  aging: "NORMAL" | "WAITING" | "OVERDUE" | null;
  readyAt: string | null;
  collectedAt: string | null;
};

type QueuePayload = {
  pickupLocationLabel: string;
  readyToHandover: QueueRow[];
  paymentRequired: QueueRow[];
  recentlyCollected: QueueRow[];
};

function ageLabel(readyAt: string | null) {
  if (!readyAt) return "";
  const mins = Math.max(0, Math.floor((Date.now() - new Date(readyAt).getTime()) / 60000));
  return `Ready ${mins}m`;
}

function agingBadge(aging: QueueRow["aging"]) {
  if (aging === "OVERDUE") return <Badge className="bg-red-500/20 text-red-300 border-red-500/30">⚠ Overdue</Badge>;
  if (aging === "WAITING") return <Badge className="bg-amber-500/20 text-amber-200 border-amber-500/30">Waiting</Badge>;
  return null;
}

export function PickupQueuePanel({
  canCollect,
  onCollected,
}: {
  canCollect: boolean;
  onCollected?: () => void;
}) {
  const [queue, setQueue] = useState<QueuePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/orders/pickup-queue", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setQueue(json.queue);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 8000);
    return () => clearInterval(interval);
  }, [load]);

  const collect = async (orderId: string) => {
    setCollectingId(orderId);
    setError("");
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "collect-order" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          json.code === "PAYMENT_REQUIRED"
            ? `Handover blocked · ${formatCurrency(fromPaise(json.outstandingAmountPaise ?? 0))} due`
            : json.error || "Could not collect",
        );
        return;
      }
      await load();
      onCollected?.();
    } finally {
      setCollectingId(null);
    }
  };

  if (loading && !queue) {
    return (
      <div className="flex justify-center py-8">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }
  if (!queue) return null;

  const empty =
    queue.readyToHandover.length + queue.paymentRequired.length + queue.recentlyCollected.length === 0;
  if (empty) return null;

  const renderRow = (row: QueueRow, locked: boolean) => (
    <div
      key={row.id}
      className="flex items-center justify-between gap-3 p-3 rounded-xl border border-white/10 bg-white/5"
    >
      <div>
        <p className="font-semibold">
          #{row.pickupNumber}
          {row.pickupCode ? <span className="text-zinc-400 font-normal"> · Code {row.pickupCode}</span> : null}
        </p>
        <p className="text-xs text-zinc-400">
          Table {row.tableNumber} · {row.paid ? "PAID" : `${formatCurrency(fromPaise(row.outstandingAmountPaise))} DUE`} ·{" "}
          {ageLabel(row.readyAt)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {agingBadge(row.aging)}
        {locked ? (
          <span className="text-amber-300 text-sm flex items-center gap-1">
            <Lock className="w-3.5 h-3.5" /> Blocked
          </span>
        ) : canCollect && !row.collectedAt ? (
          <Button
            size="sm"
            disabled={collectingId === row.id}
            onClick={() => void collect(row.id)}
          >
            {collectingId === row.id ? "Collecting…" : "Mark Collected"}
          </Button>
        ) : null}
      </div>
    </div>
  );

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Ready for collection</h2>
          <p className="text-sm text-zinc-400">Collect from {queue.pickupLocationLabel}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void load()}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {queue.readyToHandover.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-emerald-300">Ready to hand over</p>
          {queue.readyToHandover.map((row) => renderRow(row, false))}
        </div>
      )}
      {queue.paymentRequired.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-amber-300">Payment required</p>
          {queue.paymentRequired.map((row) => renderRow(row, true))}
        </div>
      )}
      {queue.recentlyCollected.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Recently collected</p>
          {queue.recentlyCollected.map((row) => (
            <p key={row.id} className="text-sm text-zinc-400">
              #{row.pickupNumber} collected
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}

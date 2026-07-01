"use client";

import { useState } from "react";
import { Bell, Droplets, Receipt, RefreshCw, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui";

type RequestType = "CALL_WAITER" | "REQUEST_BILL" | "WATER" | "REFILL" | "OTHER";

const ACTIONS: Array<{ type: RequestType; label: string; icon: typeof Bell }> = [
  { type: "CALL_WAITER", label: "Call waiter", icon: Bell },
  { type: "WATER", label: "Water", icon: Droplets },
  { type: "REQUEST_BILL", label: "Bill", icon: Receipt },
  { type: "REFILL", label: "Refill", icon: RefreshCw },
  { type: "OTHER", label: "Other", icon: MessageSquare },
];

export function CallWaiterBar({
  tableToken,
  sessionKey,
  enabled,
}: {
  tableToken: string;
  sessionKey: string | null;
  enabled: boolean;
}) {
  const [sending, setSending] = useState<RequestType | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!enabled || !sessionKey) return null;

  const send = async (type: RequestType) => {
    setSending(type);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/guest/service-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tableToken, sessionKey, type }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not send request");
        return;
      }
      setMessage(
        type === "CALL_WAITER"
          ? "Server notified — someone will be with you shortly."
          : "Request sent to staff.",
      );
    } catch {
      setError("Network error — try again.");
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
      <p className="text-sm font-medium text-zinc-300">Need something?</p>
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map(({ type, label, icon: Icon }) => (
          <Button
            key={type}
            variant="secondary"
            size="sm"
            disabled={Boolean(sending)}
            onClick={() => void send(type)}
            className="gap-1.5"
          >
            <Icon className="w-3.5 h-3.5" />
            {sending === type ? "Sending…" : label}
          </Button>
        ))}
      </div>
      {message && <p className="text-sm text-emerald-400">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

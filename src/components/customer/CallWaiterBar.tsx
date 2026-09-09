"use client";

import { useState } from "react";
import { Bell, Droplets, Receipt, RefreshCw, MessageSquare, X } from "lucide-react";
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
  serviceMode,
}: {
  tableToken: string;
  sessionKey: string | null;
  enabled: boolean;
  serviceMode?: string;
}) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState<RequestType | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!enabled || !sessionKey) return null;

  const title = serviceMode === "SELF_SERVICE" ? "Need help?" : "Need something?";

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
          ? serviceMode === "SELF_SERVICE"
            ? "Staff notified — someone will help you shortly."
            : "Server notified — someone will be with you shortly."
          : "Request sent to staff.",
      );
    } catch {
      setError("Network error — try again.");
    } finally {
      setSending(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-24 left-4 z-40 inline-flex items-center gap-1.5 rounded-full bg-white/90 dark:bg-white/10 border border-black/10 dark:border-white/15 px-3 py-2 text-xs font-semibold text-foreground shadow-lg"
        aria-expanded={open}
        aria-label={title}
      >
        <Bell className="w-4 h-4" />
        Help
      </button>

      {open ? (
        <div className="fixed bottom-40 left-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-app-shell p-3 shadow-2xl space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{title}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg text-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(serviceMode === "SELF_SERVICE"
              ? ACTIONS.filter((action) => action.type === "CALL_WAITER" || action.type === "OTHER")
              : ACTIONS
            ).map(({ type, label, icon: Icon }) => (
              <Button
                key={type}
                variant="secondary"
                size="sm"
                disabled={Boolean(sending)}
                onClick={() => void send(type)}
                className="gap-1.5"
              >
                <Icon className="w-3.5 h-3.5" />
                {sending === type
                  ? "Sending…"
                  : type === "CALL_WAITER" && serviceMode === "SELF_SERVICE"
                    ? "Request assistance"
                    : label}
              </Button>
            ))}
          </div>
          {message && <p className="text-sm text-emerald-400">{message}</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      ) : null}
    </>
  );
}

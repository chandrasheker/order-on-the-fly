"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  placement = "fixed",
}: {
  tableToken: string;
  sessionKey: string | null;
  enabled: boolean;
  serviceMode?: string;
  placement?: "fixed" | "inline";
}) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState<RequestType | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!enabled || !sessionKey) return null;

  const title = serviceMode === "SELF_SERVICE" ? "Need help?" : "Need something?";
  const visibleActions =
    serviceMode === "SELF_SERVICE"
      ? ACTIONS.filter((action) => action.type === "CALL_WAITER" || action.type === "OTHER")
      : ACTIONS;

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
        onClick={() => setOpen(true)}
        className={
          placement === "inline"
            ? "inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/30 px-3 py-1 text-xs font-semibold text-foreground"
            : "fixed bottom-24 left-4 z-40 inline-flex items-center gap-1.5 rounded-full bg-white/90 dark:bg-white/10 border border-black/10 dark:border-white/15 px-3 py-2 text-xs font-semibold text-foreground shadow-lg"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={title}
      >
        <Bell className="w-3.5 h-3.5" />
        Help
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="help-dialog-title"
              className="w-full max-w-sm rounded-2xl bg-app-shell border border-white/10 p-6"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 id="help-dialog-title" className="text-lg font-bold">
                  {title}
                </h3>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>
              <p className="text-sm text-muted mb-4">Choose what you need. Staff will get the request.</p>
              <div className="grid grid-cols-2 gap-2">
                {visibleActions.map(({ type, label, icon: Icon }) => (
                  <Button
                    key={type}
                    variant="secondary"
                    disabled={Boolean(sending)}
                    onClick={() => void send(type)}
                    className="h-auto min-h-11 justify-start gap-2 px-3 py-2.5"
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="text-left text-sm">
                      {sending === type
                        ? "Sending…"
                        : type === "CALL_WAITER" && serviceMode === "SELF_SERVICE"
                          ? "Request assistance"
                          : label}
                    </span>
                  </Button>
                ))}
              </div>
              {message ? <p className="text-sm text-emerald-400 mt-4">{message}</p> : null}
              {error ? <p className="text-sm text-red-400 mt-4">{error}</p> : null}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

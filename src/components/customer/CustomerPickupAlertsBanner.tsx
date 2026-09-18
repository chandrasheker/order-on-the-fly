"use client";

import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui";

export function CustomerPickupAlertsBanner({
  visible,
  enabling,
  denied,
  onEnable,
  onDismiss,
}: {
  visible: boolean;
  enabling: boolean;
  denied: boolean;
  onEnable: () => void;
  onDismiss: () => void;
}) {
  if (!visible) return null;

  return (
    <div className="rounded-2xl border border-orange-400/40 bg-orange-500/15 p-4 space-y-3">
      <div className="flex items-start gap-3">
        {denied ? (
          <BellOff className="w-5 h-5 text-orange-200 shrink-0 mt-0.5" />
        ) : (
          <Bell className="w-5 h-5 text-orange-200 shrink-0 mt-0.5" />
        )}
        <div>
          <p className="font-semibold">Get a ping when your order is ready</p>
          <p className="text-sm text-zinc-300 mt-1">
            {denied
              ? "Notifications are blocked in this browser. Enable them in site settings to hear when pickup is ready."
              : "Allow notifications so we can alert you — even if this tab is in the background — when staff marks your order ready to collect."}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        {!denied ? (
          <Button size="sm" onClick={onEnable} disabled={enabling} className="flex-1">
            {enabling ? "Asking…" : "Enable pickup alerts"}
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" onClick={onDismiss} className={denied ? "flex-1" : ""}>
          Not now
        </Button>
      </div>
    </div>
  );
}

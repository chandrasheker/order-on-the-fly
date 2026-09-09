"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui";
import { RemoteOrdersPanel } from "@/components/staff/RemoteOrdersPanel";
import { forgetTakeOrderSession } from "@/store/staff-cart";
import type { TakeOrderMode } from "@/lib/take-order-return";

export function TakeOrderOverlay({
  onClose,
  initialMode,
}: {
  onClose: () => void;
  initialMode?: TakeOrderMode;
}) {
  const close = () => {
    forgetTakeOrderSession();
    onClose();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("take-order-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove("take-order-open");
    };
    // Only bind once. Re-running this on parent re-renders used to wipe the cart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-app-shell text-foreground"
      role="dialog"
      aria-modal="true"
      aria-labelledby="take-order-title"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--surface-border)] px-3 py-2.5 sm:px-4 lg:px-6 shrink-0 pt-[max(0.65rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <p id="take-order-title" className="text-base sm:text-lg font-semibold truncate">
            Take Order
          </p>
          <p className="text-xs text-muted mt-0.5 hidden md:block">
            Pick dishes on the left. The cart on the right updates as you go.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={close} aria-label="Close take order">
          <X className="w-4 h-4" />
          <span className="hidden sm:inline">Close</span>
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-3 py-2 sm:px-4 sm:py-3 lg:px-6">
        <RemoteOrdersPanel splitCart initialMode={initialMode} />
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui";
import { RemoteOrdersPanel } from "@/components/staff/RemoteOrdersPanel";
import { forgetTakeOrderSession } from "@/store/staff-cart";

export function TakeOrderOverlay({ onClose }: { onClose: () => void }) {
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
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
    // Only bind once. Re-running this on parent re-renders used to wipe the cart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-app-shell text-foreground"
      role="dialog"
      aria-modal="true"
      aria-labelledby="take-order-title"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--surface-border)] px-4 py-3 lg:px-6 shrink-0">
        <div className="min-w-0">
          <p id="take-order-title" className="text-lg font-semibold truncate">
            Take Order
          </p>
          <p className="text-xs text-muted mt-0.5">
            Pick dishes on the left. The cart on the right updates as you go.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={close} aria-label="Close take order">
          <X className="w-4 h-4" />
          Close
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-4 py-4 lg:px-6">
        <RemoteOrdersPanel stickyClassName="top-0" splitCart />
      </div>
    </div>
  );
}

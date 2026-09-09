"use client";

import { useState } from "react";
import { Tag } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { useCartStore } from "@/store/cart";

export function PromoCodeInput({
  enabled,
  compact = false,
}: {
  enabled: boolean;
  compact?: boolean;
}) {
  const { promoCode, setPromoCode } = useCartStore();
  const [draft, setDraft] = useState(promoCode);
  const [open, setOpen] = useState(Boolean(promoCode));

  if (!enabled) return null;

  if (compact && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left text-xs font-medium text-orange-800 dark:text-orange-300 px-1 py-0.5"
      >
        <Tag className="w-3 h-3 inline-block mr-1 align-[-1px]" />
        Have a promo code?
      </button>
    );
  }

  return (
    <div className={compact ? "space-y-1" : "p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2"}>
      {!compact && (
        <label className="text-sm text-zinc-400 flex items-center gap-1.5">
          <Tag className="w-3.5 h-3.5" />
          Promo code (optional)
        </label>
      )}
      <div className="flex gap-2">
        <Input
          placeholder="Promo code"
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          className={compact ? "h-9 text-sm" : undefined}
        />
        <Button variant="secondary" size={compact ? "sm" : "md"} onClick={() => setPromoCode(draft)}>
          Apply
        </Button>
      </div>
      {promoCode && (
        <p className="text-xs text-emerald-400">Code applied: {promoCode}</p>
      )}
    </div>
  );
}

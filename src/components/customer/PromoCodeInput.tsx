"use client";

import { useState } from "react";
import { Tag } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { useCartStore } from "@/store/cart";

export function PromoCodeInput({ enabled }: { enabled: boolean }) {
  const { promoCode, setPromoCode } = useCartStore();
  const [draft, setDraft] = useState(promoCode);

  if (!enabled) return null;

  return (
    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
      <label className="text-sm text-zinc-400 flex items-center gap-1.5">
        <Tag className="w-3.5 h-3.5" />
        Promo code (optional)
      </label>
      <div className="flex gap-2">
        <Input
          placeholder="e.g. HAPPY20"
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
        />
        <Button variant="secondary" onClick={() => setPromoCode(draft)}>
          Apply
        </Button>
      </div>
      {promoCode && (
        <p className="text-xs text-emerald-400">Code applied: {promoCode}</p>
      )}
    </div>
  );
}

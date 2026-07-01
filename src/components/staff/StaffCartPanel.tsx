"use client";

import { Minus, Plus, StickyNote, Trash2 } from "lucide-react";
import { Button, Input, Spinner } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import type { CartItem } from "@/store/cart";

type StaffCartPanelProps = {
  items: CartItem[];
  total: number;
  maxPrepTime: number;
  placing: boolean;
  onUpdateQuantity: (lineId: string, quantity: number) => void;
  onUpdateNotes: (lineId: string, notes: string) => void;
  onPlaceOrder: () => void;
  onClearCart: () => void;
  className?: string;
};

export function StaffCartPanel({
  items,
  total,
  maxPrepTime,
  placing,
  onUpdateQuantity,
  onUpdateNotes,
  onPlaceOrder,
  onClearCart,
  className,
}: StaffCartPanelProps) {
  if (items.length === 0) return null;

  return (
    <div className={className}>
      <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-3">
        <p className="text-sm font-semibold text-violet-200">Current order</p>
        {items.map((item) => (
          <div key={item.lineId} className="rounded-xl bg-black/20 border border-white/10 p-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-white">{item.name}</p>
                <p className="text-xs text-zinc-500">
                  {formatCurrency(item.price)} each · ~{item.prepTimeMinutes} min
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onUpdateQuantity(item.lineId, item.quantity - 1)}
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-5 text-center font-bold text-white">{item.quantity}</span>
                <button
                  type="button"
                  onClick={() => onUpdateQuantity(item.lineId, item.quantity + 1)}
                  className="w-8 h-8 rounded-full bg-violet-500 flex items-center justify-center text-white"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StickyNote className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <Input
                placeholder="Special instructions (e.g. less spicy, no onion)"
                value={item.notes ?? ""}
                onChange={(e) => onUpdateNotes(item.lineId, e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>
        ))}

        <div className="flex items-center justify-between pt-2 border-t border-white/10">
          <div>
            <p className="text-xs text-zinc-500">Estimated prep</p>
            <p className="text-sm text-zinc-300">~{maxPrepTime} min</p>
          </div>
          <p className="text-lg font-bold text-white">{formatCurrency(total)}</p>
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            disabled={placing}
            onClick={onClearCart}
          >
            <Trash2 className="w-4 h-4" />
            Empty cart
          </Button>
          <Button type="button" className="flex-1" disabled={placing} onClick={onPlaceOrder}>
            {placing ? <Spinner /> : "Send to kitchen"}
          </Button>
        </div>
      </div>
    </div>
  );
}

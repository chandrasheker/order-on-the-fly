"use client";

import { Minus, Plus, Printer, StickyNote, Trash2, X } from "lucide-react";
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
  onPrint?: () => void;
  printing?: boolean;
  placeLabel?: string;
  allowEmpty?: boolean;
};

function CartLines({
  items,
  total,
  maxPrepTime,
  placing,
  onUpdateQuantity,
  onUpdateNotes,
  onPlaceOrder,
  onClearCart,
  onPrint,
  printing,
  placeLabel,
}: StaffCartPanelProps) {
  return (
    <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-3">
      <p className="text-sm font-semibold text-violet-800 dark:text-violet-200">Cart</p>
      {items.map((item) => (
        <div key={item.lineId} className="rounded-xl bg-black/20 border border-white/10 p-3 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-foreground">{item.name}</p>
              <p className="text-xs text-muted">
                {formatCurrency(item.price)} each · ~{item.prepTimeMinutes} min
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onUpdateQuantity(item.lineId, item.quantity - 1)}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-foreground"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-5 text-center font-bold text-foreground">{item.quantity}</span>
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
            <StickyNote className="w-3.5 h-3.5 text-muted shrink-0" />
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
          <p className="text-xs text-muted">Estimated prep</p>
          <p className="text-sm text-foreground">~{maxPrepTime} min</p>
        </div>
        <p className="text-lg font-bold text-foreground">{formatCurrency(total)}</p>
      </div>

      <div className="flex flex-col gap-2 pt-1">
        <div className="flex gap-2">
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
            {placing ? <Spinner /> : placeLabel ?? "Send to kitchen"}
          </Button>
        </div>
        {onPrint ? (
          <Button type="button" variant="secondary" disabled={placing || printing} onClick={onPrint}>
            {printing ? <Spinner /> : <Printer className="w-4 h-4" />}
            Print
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function StaffCartPanel(props: StaffCartPanelProps) {
  if (props.items.length === 0 && !props.allowEmpty) return null;

  return (
    <div className={props.className}>
      {props.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-4">
          <p className="text-sm font-semibold text-foreground">Cart</p>
          <p className="text-xs text-muted mt-1">
            Add dishes on the left. This list updates as you tap.
          </p>
        </div>
      ) : (
        <CartLines {...props} />
      )}
    </div>
  );
}

export function StaffCartDrawer({
  open,
  onClose,
  ...props
}: StaffCartPanelProps & { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90]">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Close cart"
        onClick={onClose}
      />
      <aside className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-[color:var(--surface-border)] bg-app-shell p-4 shadow-2xl">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-lg font-semibold text-foreground">View cart</p>
            <p className="text-xs text-muted">Add, remove, or change quantities, then send</p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={onClose} aria-label="Close cart">
            <X className="w-4 h-4" />
            Close
          </Button>
        </div>
        {props.items.length === 0 ? (
          <p className="text-sm text-muted">Cart is empty. Tap menu items to add them.</p>
        ) : (
          <CartLines {...props} />
        )}
      </aside>
    </div>
  );
}

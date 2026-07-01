"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { Button } from "@/components/ui";

interface ModifierOption {
  id: string;
  name: string;
  priceDelta: number;
  isDefault: boolean;
}

interface ModifierGroup {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: ModifierOption[];
}

export function ModifierPickerModal({
  itemName,
  basePrice,
  groups,
  onConfirm,
  onClose,
}: {
  itemName: string;
  basePrice: number;
  groups: ModifierGroup[];
  onConfirm: (selectedIds: string[], labels: string, totalPrice: number) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => {
    const defaults = new Set<string>();
    for (const g of groups) {
      const def = g.options.find((o) => o.isDefault);
      if (def) defaults.add(def.id);
    }
    return defaults;
  });
  const [error, setError] = useState<string | null>(null);

  const toggle = (group: ModifierGroup, optionId: string) => {
    setError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      const inGroup = group.options.filter((o) => next.has(o.id));
      if (next.has(optionId)) {
        next.delete(optionId);
        return next;
      }
      if (group.maxSelect === 1) {
        for (const o of group.options) next.delete(o.id);
        next.add(optionId);
        return next;
      }
      if (inGroup.length >= group.maxSelect) return prev;
      next.add(optionId);
      return next;
    });
  };

  const extra = groups
    .flatMap((g) => g.options)
    .filter((o) => selected.has(o.id))
    .reduce((s, o) => s + o.priceDelta, 0);
  const totalPrice = basePrice + extra;

  const confirm = () => {
    for (const g of groups) {
      const count = g.options.filter((o) => selected.has(o.id)).length;
      if (g.required && count === 0) {
        setError(`Choose an option for ${g.name}`);
        return;
      }
      if (count < g.minSelect) {
        setError(`Select at least ${g.minSelect} for ${g.name}`);
        return;
      }
    }
    const labels = groups
      .flatMap((g) => g.options.filter((o) => selected.has(o.id)).map((o) => o.name))
      .join(", ");
    onConfirm(Array.from(selected), labels, totalPrice);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-zinc-900 border border-white/10 p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-white">{itemName}</h3>
            <p className="text-sm text-orange-400">{formatCurrency(totalPrice)}</p>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {groups.map((group) => (
          <div key={group.id} className="space-y-2">
            <p className="text-sm font-medium text-zinc-300">
              {group.name}
              {group.required && <span className="text-red-400"> *</span>}
            </p>
            <div className="space-y-1">
              {group.options.map((opt) => {
                const active = selected.has(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggle(group, opt.id)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-colors",
                      active
                        ? "border-orange-500/50 bg-orange-500/15 text-white"
                        : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10",
                    )}
                  >
                    <span>{opt.name}</span>
                    {opt.priceDelta > 0 && (
                      <span className="text-orange-400">+{formatCurrency(opt.priceDelta)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <Button onClick={confirm} className="w-full">
          Add to cart — {formatCurrency(totalPrice)}
        </Button>
      </motion.div>
    </div>
  );
}

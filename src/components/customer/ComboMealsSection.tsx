"use client";

import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui";
import { useCartStore } from "@/store/cart";

interface ComboItem {
  menuItem: { id: string; name: string; price: number; isAvailable: boolean };
  quantity: number;
}

interface ComboMeal {
  id: string;
  name: string;
  description: string | null;
  comboPrice: number;
  items: ComboItem[];
}

export function ComboMealsSection({
  combos,
  canOrder,
  onAddCombo,
}: {
  combos: ComboMeal[];
  canOrder: boolean;
  onAddCombo: (comboMealId: string) => void;
}) {
  const { items } = useCartStore();

  if (!combos.length) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-white">Combo deals</h2>
      {combos.map((combo) => {
        const listTotal = combo.items.reduce(
          (s, i) => s + i.menuItem.price * i.quantity,
          0,
        );
        const savings = Math.max(0, listTotal - combo.comboPrice);
        const inCart = items.some((i) => i.notes?.includes(`Combo: ${combo.name}`));

        return (
          <div
            key={combo.id}
            className="p-4 rounded-2xl bg-gradient-to-br from-orange-500/10 to-rose-500/5 border border-orange-500/20"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-white">{combo.name}</h3>
                {combo.description && (
                  <p className="text-sm text-zinc-400 mt-0.5">{combo.description}</p>
                )}
                <ul className="text-xs text-zinc-500 mt-2 space-y-0.5">
                  {combo.items.map((i) => (
                    <li key={i.menuItem.id}>
                      {i.quantity}× {i.menuItem.name}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-orange-400">{formatCurrency(combo.comboPrice)}</p>
                {savings > 0 && (
                  <p className="text-xs text-emerald-400">Save {formatCurrency(savings)}</p>
                )}
              </div>
            </div>
            <Button
              className="w-full mt-3"
              disabled={!canOrder || inCart}
              onClick={() => onAddCombo(combo.id)}
            >
              {inCart ? "Combo in cart" : "Add combo"}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

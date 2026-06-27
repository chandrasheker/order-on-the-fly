"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Minus, ShoppingBag, Leaf, Flame } from "lucide-react";
import { formatCurrency, getPrepTimeLabel } from "@/lib/utils";
import { Button, Badge } from "@/components/ui";
import { useCartStore } from "@/store/cart";

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  prepTimeMinutes: number;
  isVeg: boolean;
  isSpicy: boolean;
  isAvailable: boolean;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  items: MenuItem[];
}

export function MenuView({
  categories,
  onOrder,
  ordering,
}: {
  categories: Category[];
  onOrder: () => void;
  ordering: boolean;
}) {
  const [activeCategory, setActiveCategory] = useState(categories[0]?.slug || "");
  const { items, addItem, updateQuantity, total, maxPrepTime } = useCartStore();
  const cartCount = items.reduce((s, i) => s + i.quantity, 0);

  const currentCategory = categories.find((c) => c.slug === activeCategory);

  return (
    <div className="pb-28">
      {/* Category tabs */}
      <div className="sticky top-0 z-20 -mx-4 px-4 py-3 bg-[#0f0f1a]/90 backdrop-blur-xl border-b border-white/5">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {categories.map((cat) => (
            <button
              key={cat.slug}
              onClick={() => setActiveCategory(cat.slug)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                activeCategory === cat.slug
                  ? "bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-lg shadow-orange-500/25"
                  : "bg-white/5 text-zinc-400 hover:text-white border border-white/10"
              }`}
            >
              <span>{cat.icon}</span>
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Menu items */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeCategory}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="mt-4 space-y-3"
        >
          {currentCategory?.items.map((item) => {
            const inCart = items.find((i) => i.menuItemId === item.id);
            return (
              <motion.div
                key={item.id}
                layout
                className="flex gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-orange-500/20 transition-all"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-white truncate">{item.name}</h3>
                    {item.isVeg && (
                      <span className="w-4 h-4 rounded-sm border-2 border-emerald-500 flex items-center justify-center flex-shrink-0">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      </span>
                    )}
                    {!item.isVeg && (
                      <span className="w-4 h-4 rounded-sm border-2 border-red-500 flex items-center justify-center flex-shrink-0">
                        <span className="w-0 h-0 border-l-[3px] border-r-[3px] border-b-[5px] border-l-transparent border-r-transparent border-b-red-500" />
                      </span>
                    )}
                    {item.isSpicy && <Flame className="w-3.5 h-3.5 text-red-400" />}
                  </div>
                  {item.description && (
                    <p className="text-sm text-zinc-400 mb-2 line-clamp-2">{item.description}</p>
                  )}
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-orange-400">{formatCurrency(item.price)}</span>
                    <Badge className="bg-white/5 text-zinc-400 border-white/10">
                      ⏱ {getPrepTimeLabel(item.prepTimeMinutes)}
                    </Badge>
                  </div>
                </div>
                <div className="flex flex-col items-end justify-center">
                  {inCart ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.id, inCart.quantity - 1)}
                        className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-6 text-center font-bold text-white">{inCart.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, inCart.quantity + 1)}
                        className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white hover:bg-orange-400"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() =>
                        addItem({
                          menuItemId: item.id,
                          name: item.name,
                          price: item.price,
                          prepTimeMinutes: item.prepTimeMinutes,
                        })
                      }
                      className="px-4 py-2 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 text-sm font-medium hover:bg-orange-500/30 transition-all"
                    >
                      <Plus className="w-4 h-4 inline mr-1" />
                      Add
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </AnimatePresence>

      {/* Floating cart bar */}
      <AnimatePresence>
        {cartCount > 0 && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-0 left-0 right-0 p-4 z-30"
          >
            <div className="max-w-lg mx-auto">
              <Button
                onClick={onOrder}
                disabled={ordering}
                size="lg"
                className="w-full justify-between"
              >
                <span className="flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5" />
                  {cartCount} item{cartCount > 1 ? "s" : ""} · ~{maxPrepTime()} min wait
                </span>
                <span className="font-bold">{formatCurrency(total())}</span>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

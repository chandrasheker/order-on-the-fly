"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Minus, ShoppingBag, Flame, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { formatCurrency, getPrepTimeLabel, cn } from "@/lib/utils";
import { Button, Badge, Input } from "@/components/ui";
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

function MenuItemCard({
  item,
  inCart,
  onAdd,
  onUpdateQty,
}: {
  item: MenuItem;
  inCart: { quantity: number } | undefined;
  onAdd: () => void;
  onUpdateQty: (qty: number) => void;
}) {
  return (
    <div className="flex gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-orange-500/20 transition-all">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-semibold text-white">{item.name}</h3>
          {item.isVeg ? (
            <span className="w-4 h-4 rounded-sm border-2 border-emerald-500 flex items-center justify-center flex-shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            </span>
          ) : (
            <span className="w-4 h-4 rounded-sm border-2 border-red-500 flex items-center justify-center flex-shrink-0">
              <span className="w-0 h-0 border-l-[3px] border-r-[3px] border-b-[5px] border-l-transparent border-r-transparent border-b-red-500" />
            </span>
          )}
          {item.isSpicy && <Flame className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
        </div>
        {item.description && (
          <p className="text-sm text-zinc-400 mb-2 line-clamp-2">{item.description}</p>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-bold text-orange-400">{formatCurrency(item.price)}</span>
          <Badge className="bg-white/5 text-zinc-400 border-white/10">
            ⏱ {getPrepTimeLabel(item.prepTimeMinutes)}
          </Badge>
        </div>
      </div>
      <div className="flex flex-col items-end justify-center flex-shrink-0">
        {inCart ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onUpdateQty(inCart.quantity - 1)}
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white active:bg-white/20"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-6 text-center font-bold text-white">{inCart.quantity}</span>
            <button
              type="button"
              onClick={() => onUpdateQty(inCart.quantity + 1)}
              className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center text-white active:bg-orange-400"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onAdd}
            className="px-4 py-2.5 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 text-sm font-medium active:bg-orange-500/30"
          >
            <Plus className="w-4 h-4 inline mr-1" />
            Add
          </button>
        )}
      </div>
    </div>
  );
}

export function MenuView({
  categories,
  onOrder,
  ordering,
  canOrder = true,
}: {
  categories: Category[];
  onOrder: () => void;
  ordering: boolean;
  canOrder?: boolean;
}) {
  const [activeCategory, setActiveCategory] = useState(categories[0]?.slug || "");
  const [searchQuery, setSearchQuery] = useState("");
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const { items, addItem, updateQuantity, total, maxPrepTime } = useCartStore();
  const cartCount = items.reduce((s, i) => s + i.quantity, 0);

  const updateScrollHints = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    updateScrollHints();
    el.addEventListener("scroll", updateScrollHints, { passive: true });
    window.addEventListener("resize", updateScrollHints);
    return () => {
      el.removeEventListener("scroll", updateScrollHints);
      window.removeEventListener("resize", updateScrollHints);
    };
  }, [categories, updateScrollHints]);

  const scrollTabs = (dir: "left" | "right") => {
    tabsRef.current?.scrollBy({ left: dir === "left" ? -160 : 160, behavior: "smooth" });
  };

  const jumpToCategory = (slug: string) => {
    setActiveCategory(slug);
    const section = sectionRefs.current[slug];
    if (section) {
      const top = section.getBoundingClientRect().top + window.scrollY - 72;
      window.scrollTo({ top, behavior: "smooth" });
    }
    const tab = tabsRef.current?.querySelector(`[data-slug="${slug}"]`) as HTMLElement | null;
    tab?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  };

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    const setup = () => {
      categories.forEach((cat) => {
        const el = sectionRefs.current[cat.slug];
        if (!el) return;
        const observer = new IntersectionObserver(
          (entries) => {
            const entry = entries[0];
            if (!entry?.isIntersecting) return;
            setActiveCategory(cat.slug);
            const tab = tabsRef.current?.querySelector(
              `[data-slug="${cat.slug}"]`
            ) as HTMLElement | null;
            tab?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
          },
          { rootMargin: "-80px 0px -55% 0px", threshold: 0 }
        );
        observer.observe(el);
        observers.push(observer);
      });
    };

    const timer = window.setTimeout(setup, 50);
    return () => {
      window.clearTimeout(timer);
      observers.forEach((o) => o.disconnect());
    };
  }, [categories]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  const searchResults = isSearching
    ? categories.flatMap((cat) =>
        cat.items
          .filter(
            (item) =>
              item.name.toLowerCase().includes(normalizedQuery) ||
              item.description?.toLowerCase().includes(normalizedQuery)
          )
          .map((item) => ({ item, category: cat }))
      )
    : [];

  const visibleCategories = isSearching
    ? categories
        .map((cat) => ({
          ...cat,
          items: cat.items.filter(
            (item) =>
              item.name.toLowerCase().includes(normalizedQuery) ||
              item.description?.toLowerCase().includes(normalizedQuery)
          ),
        }))
        .filter((cat) => cat.items.length > 0)
    : categories;

  return (
    <div className="pb-32">
      {/* Sticky category jump nav */}
      <div className="sticky top-0 z-20 -mx-4 px-2 py-2 bg-[#0f0f1a]/95 backdrop-blur-xl border-b border-white/5 space-y-2">
        <div className="relative px-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
          <Input
            type="search"
            placeholder="Search menu items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9"
            aria-label="Search menu items"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {!isSearching && (
        <div className="relative flex items-center">
          {canScrollLeft && (
            <button
              type="button"
              onClick={() => scrollTabs("left")}
              className="absolute left-0 z-10 w-8 h-8 rounded-full bg-[#0f0f1a]/90 border border-white/10 flex items-center justify-center text-white shadow-lg"
              aria-label="Scroll categories left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}

          <div
            ref={tabsRef}
            className="flex gap-2 overflow-x-auto scroll-smooth px-1 py-1 mx-6"
            style={{
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              touchAction: "pan-x",
            }}
          >
            {categories.map((cat) => (
              <button
                key={cat.slug}
                type="button"
                data-slug={cat.slug}
                onClick={() => jumpToCategory(cat.slug)}
                className={cn(
                  "flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium transition-all whitespace-nowrap",
                  activeCategory === cat.slug
                    ? "bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-lg shadow-orange-500/25"
                    : "bg-white/5 text-zinc-400 border border-white/10 active:bg-white/10"
                )}
              >
                <span>{cat.icon}</span>
                {cat.name}
              </button>
            ))}
          </div>

          {canScrollRight && (
            <button
              type="button"
              onClick={() => scrollTabs("right")}
              className="absolute right-0 z-10 w-8 h-8 rounded-full bg-[#0f0f1a]/90 border border-white/10 flex items-center justify-center text-white shadow-lg"
              aria-label="Scroll categories right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
        )}
        <p className="text-center text-xs text-zinc-500 px-4">
          {isSearching
            ? `${searchResults.length} result${searchResults.length === 1 ? "" : "s"}`
            : "Tap a category or scroll down to browse the full menu"}
        </p>
      </div>

      {/* All categories — vertical scroll */}
      <div className="mt-5 space-y-8">
        {isSearching && searchResults.length === 0 && (
          <div className="text-center py-12 text-zinc-500">
            <Search className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>No items match &ldquo;{searchQuery}&rdquo;</p>
          </div>
        )}
        {visibleCategories.map((cat) => (
          <section
            key={cat.slug}
            ref={(el) => {
              sectionRefs.current[cat.slug] = el;
            }}
            id={`menu-${cat.slug}`}
            className="scroll-mt-20"
          >
            <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2 sticky top-[4.5rem] z-10 py-2 bg-[#0f0f1a]/90 backdrop-blur-sm -mx-1 px-1">
              <span className="text-xl">{cat.icon}</span>
              {cat.name}
              <span className="text-xs font-normal text-zinc-500">({cat.items.length})</span>
            </h2>
            <div className="space-y-3">
              {cat.items.map((item) => {
                const inCart = items.find((i) => i.menuItemId === item.id);
                return (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    inCart={inCart}
                    onAdd={() => {
                      if (!canOrder) return;
                      addItem({
                        menuItemId: item.id,
                        name: item.name,
                        price: item.price,
                        prepTimeMinutes: item.prepTimeMinutes,
                      });
                    }}
                    onUpdateQty={(qty) => canOrder && updateQuantity(item.id, qty)}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Floating cart */}
      <AnimatePresence>
        {cartCount > 0 && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-0 left-0 right-0 p-4 z-30 pointer-events-none"
          >
            <div className="max-w-lg mx-auto pointer-events-auto">
              <Button
                onClick={onOrder}
                disabled={ordering || !canOrder}
                size="lg"
                className="w-full justify-between shadow-2xl"
              >
                <span className="flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5" />
                  {cartCount} item{cartCount > 1 ? "s" : ""} · ~{maxPrepTime()} min
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

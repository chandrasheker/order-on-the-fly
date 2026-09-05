"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { Printer, RefreshCw } from "lucide-react";

type DisplayItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  isVeg: boolean;
  isSpicy: boolean;
  imageUrl?: string | null;
};

type DisplayCategory = {
  id: string;
  name: string;
  icon: string | null;
  items: DisplayItem[];
};

type DisplayMenu = {
  restaurant: { name: string; slug: string; logoUrl: string | null };
  categories: DisplayCategory[];
  updatedAt: string;
};

export function MenuDisplayBoard({
  slug,
  printMode = false,
}: {
  slug: string;
  printMode?: boolean;
}) {
  const [menu, setMenu] = useState<DisplayMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadMenu = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch(`/api/menu/display/${encodeURIComponent(slug)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setError("Menu not available");
        return;
      }
      const json = (await res.json()) as DisplayMenu;
      setMenu(json);
      setError("");
    } catch {
      setError((prev) => prev || "Could not load menu");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [slug]);

  useEffect(() => {
    void loadMenu();
    if (printMode) return;
    const interval = setInterval(() => void loadMenu(true), 30_000);
    return () => clearInterval(interval);
  }, [loadMenu, printMode]);

  useEffect(() => {
    if (printMode && menu && !loading) {
      const timer = setTimeout(() => window.print(), 400);
      return () => clearTimeout(timer);
    }
  }, [printMode, menu, loading]);

  if (loading && !menu) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0c0c12] text-white">
        <p className="text-zinc-400 animate-pulse">Loading menu…</p>
      </div>
    );
  }

  if (error || !menu) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0c0c12] text-white p-6">
        <p className="text-red-300">{error || "Menu not found"}</p>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen text-white ${printMode ? "bg-white text-black print-menu" : "bg-[#0c0c12]"}`}
    >
      {!printMode && (
        <div className="fixed top-4 right-4 z-20 flex gap-2 print:hidden">
          <button
            type="button"
            onClick={() => void loadMenu(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => window.open(`/display/menu/${slug}/print`, "_blank")}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/30 text-sm text-orange-200"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>
      )}

      <header
        className={`text-center px-6 pt-10 pb-8 ${printMode ? "border-b border-zinc-300" : "border-b border-white/10"}`}
      >
        {menu.restaurant.logoUrl && (
          <img
            src={menu.restaurant.logoUrl}
            alt=""
            className="h-16 w-16 object-contain mx-auto mb-4 rounded-xl"
          />
        )}
        <h1 className={`text-4xl md:text-5xl font-bold tracking-tight ${printMode ? "text-black" : ""}`}>
          {menu.restaurant.name}
        </h1>
        <p className={`mt-2 text-sm ${printMode ? "text-zinc-600" : "text-zinc-400"}`}>
          {printMode ? "Menu" : "Digital menu · updates automatically"}
        </p>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-8 space-y-10">
        {menu.categories.length === 0 ? (
          <p className={`text-center py-20 ${printMode ? "text-zinc-500" : "text-zinc-400"}`}>
            No live menu items right now
          </p>
        ) : (
          menu.categories.map((category) => (
            <section key={category.id}>
              <h2
                className={`flex items-center gap-3 text-2xl md:text-3xl font-bold mb-5 ${
                  printMode ? "text-black border-b border-zinc-300 pb-2" : "text-orange-300"
                }`}
              >
                <span>{category.icon ?? "🍽️"}</span>
                {category.name}
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                {category.items.map((item) => (
                  <article
                    key={item.id}
                    className={`rounded-2xl p-4 ${
                      printMode
                        ? "border border-zinc-200"
                        : "bg-white/[0.04] border border-white/10 backdrop-blur-sm"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {!printMode && item.imageUrl ? (
                        <div className="relative w-16 h-16 shrink-0 overflow-hidden rounded-xl bg-white/5">
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            loading="lazy"
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        </div>
                      ) : null}
                      <div className="min-w-0">
                        <h3 className={`font-semibold text-lg ${printMode ? "text-black" : ""}`}>
                          {item.name}
                        </h3>
                        {item.description && (
                          <p className={`text-sm mt-1 ${printMode ? "text-zinc-600" : "text-zinc-400"}`}>
                            {item.description}
                          </p>
                        )}
                        <div className="flex gap-2 mt-2 text-xs">
                          {item.isVeg && (
                            <span className="text-emerald-500 border border-emerald-500/40 px-1.5 py-0.5 rounded">
                              Veg
                            </span>
                          )}
                          {item.isSpicy && (
                            <span className="text-red-400 border border-red-400/40 px-1.5 py-0.5 rounded">
                              Spicy
                            </span>
                          )}
                        </div>
                      </div>
                      <p className={`text-lg font-bold shrink-0 ${printMode ? "text-black" : "text-orange-300"}`}>
                        {formatCurrency(item.price)}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      <style jsx global>{`
        @media print {
          .print-menu {
            background: white !important;
            color: black !important;
          }
          @page {
            margin: 12mm;
          }
        }
      `}</style>
    </div>
  );
}

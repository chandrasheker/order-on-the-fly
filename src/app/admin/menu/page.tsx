"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  FolderPlus,
  Monitor,
  Plus,
  Printer,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button, Card, Spinner, Badge, Input } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";

interface MenuItem {
  id: string;
  name: string;
  price: number;
  prepTimeMinutes: number;
  isAvailable: boolean;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  isEnabled: boolean;
  items: MenuItem[];
}

type CategoryPreset = {
  name: string;
  slug: string;
  icon: string;
};

const QUICK_PRESETS: CategoryPreset[] = [
  { name: "Biryanis", slug: "biryanis", icon: "🍚" },
  { name: "Snacks", slug: "snacks", icon: "🥟" },
  { name: "Beverages", slug: "beverages", icon: "🥤" },
  { name: "Tea", slug: "tea", icon: "☕" },
  { name: "Today's Special", slug: "todays-special", icon: "⭐" },
  { name: "Mains", slug: "mains", icon: "🍛" },
  { name: "Desserts", slug: "desserts", icon: "🍰" },
];

function AddItemForm({
  categoryId,
  categoryName,
  onAdded,
}: {
  categoryId: string;
  categoryName: string;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [prepTimeMinutes, setPrepTimeMinutes] = useState("10");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !price) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/menu/manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId,
        name: name.trim(),
        price,
        prepTimeMinutes: parseInt(prepTimeMinutes, 10) || 10,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(json.error || "Could not add item");
      return;
    }
    setName("");
    setPrice("");
    setPrepTimeMinutes("10");
    onAdded();
  };

  return (
    <form
      onSubmit={submit}
      className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/25 space-y-3"
    >
      <p className="text-sm font-medium text-orange-200">Add item to {categoryName}</p>
      <div className="grid sm:grid-cols-[1fr_7rem_6rem_auto] gap-2">
        <Input
          placeholder="Item name, e.g. Chicken Biryani"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Input
          type="number"
          placeholder="Price ₹"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
          min="0"
        />
        <Input
          type="number"
          placeholder="Prep min"
          value={prepTimeMinutes}
          onChange={(e) => setPrepTimeMinutes(e.target.value)}
          min="1"
          max="120"
          title="Kitchen prep time in minutes"
        />
        <Button type="submit" disabled={saving} size="md" className="sm:w-auto w-full">
          <Plus className="w-4 h-4" /> {saving ? "Adding…" : "Add item"}
        </Button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </form>
  );
}

export default function MenuManagePage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState("🍽️");
  const [addingCategory, setAddingCategory] = useState(false);
  const [addingPresets, setAddingPresets] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showRewards, setShowRewards] = useState(false);
  const [rewardSettings, setRewardSettings] = useState({
    rewardThresholdTea: 250,
    rewardThresholdBeverage: 500,
    rewardTeaLabel: "",
    rewardBeverageLabel: "",
  });
  const [savingRewards, setSavingRewards] = useState(false);
  const [restaurantSlug, setRestaurantSlug] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [togglingCategoryId, setTogglingCategoryId] = useState<string | null>(null);
  const [togglingItemId, setTogglingItemId] = useState<string | null>(null);

  const fetchMenu = useCallback(async () => {
    const [menuRes, settingsRes, meRes] = await Promise.all([
      fetch("/api/menu/manage"),
      fetch("/api/rewards/settings"),
      fetch("/api/auth/me"),
    ]);
    if (!menuRes.ok) {
      router.push("/");
      return;
    }
    const menuData = await menuRes.json();
    setCategories(menuData.categories ?? []);
    if (settingsRes.ok) {
      const s = await settingsRes.json();
      setRewardSettings(s.settings);
    }
    if (meRes.ok) {
      const me = await meRes.json();
      setRestaurantSlug(me.user?.restaurantSlug ?? "");
      setRestaurantName(me.user?.restaurantName ?? "");
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void fetchMenu();
  }, [fetchMenu]);

  const flash = (text: string, isError = false) => {
    if (isError) {
      setError(text);
      setMessage("");
    } else {
      setMessage(text);
      setError("");
    }
    window.setTimeout(() => {
      setMessage("");
      setError("");
    }, 4000);
  };

  const addCustomCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setAddingCategory(true);
    const res = await fetch("/api/menu/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCategoryName.trim(), icon: newCategoryIcon }),
    });
    const json = await res.json();
    setAddingCategory(false);
    if (!res.ok) {
      flash(json.error || "Could not add category", true);
      return;
    }
    setNewCategoryName("");
    setExpanded((prev) => ({ ...prev, [json.category.id]: true }));
    flash(`Added category “${json.category.name}”`);
    await fetchMenu();
  };

  const addQuickPreset = async (preset: CategoryPreset) => {
    if (categories.some((c) => c.slug === preset.slug)) {
      flash(`${preset.name} already exists`, true);
      return;
    }
    setAddingPresets(true);
    const res = await fetch("/api/menu/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "presets", slugs: [preset.slug] }),
    });
    const json = await res.json();
    setAddingPresets(false);
    if (!res.ok) {
      flash(json.error || "Could not add category", true);
      return;
    }
    const created = json.categories?.[0];
    if (created) {
      setExpanded((prev) => ({ ...prev, [created.id]: true }));
    }
    flash(`Added ${preset.name}`);
    await fetchMenu();
  };

  const bootstrapMenu = async () => {
    setAddingPresets(true);
    const res = await fetch("/api/menu/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bootstrap" }),
    });
    setAddingPresets(false);
    if (!res.ok) {
      const json = await res.json();
      flash(json.error || "Could not set up menu", true);
      return;
    }
    flash("Starter menu categories added");
    await fetchMenu();
  };

  const deleteCategory = async (cat: Category) => {
    if (cat.items.length > 0) {
      flash("Remove all items first, then delete the category", true);
      return;
    }
    if (!confirm(`Delete category “${cat.name}”?`)) return;
    const res = await fetch("/api/menu/categories", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: cat.id }),
    });
    const json = await res.json();
    if (!res.ok) {
      flash(json.error || "Could not delete category", true);
      return;
    }
    flash(`Deleted ${cat.name}`);
    await fetchMenu();
  };

  const toggleAvailability = async (itemId: string, isAvailable: boolean) => {
    setTogglingItemId(itemId);
    await fetch("/api/menu/manage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, isAvailable: !isAvailable }),
    });
    setTogglingItemId(null);
    await fetchMenu();
  };

  const toggleCategoryEnabled = async (category: Category) => {
    setTogglingCategoryId(category.id);
    await fetch("/api/menu/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: category.id, isEnabled: !category.isEnabled }),
    });
    setTogglingCategoryId(null);
    flash(category.isEnabled ? `Disabled ${category.name}` : `Enabled ${category.name}`);
    await fetchMenu();
  };

  const openDigitalDisplay = () => {
    if (!restaurantSlug) return;
    window.open(`/display/menu/${restaurantSlug}`, "_blank", "noopener,noreferrer");
  };

  const openPrintMenu = () => {
    if (!restaurantSlug) return;
    window.open(`/display/menu/${restaurantSlug}/print`, "_blank", "noopener,noreferrer");
  };

  const updateItem = async (
    itemId: string,
    field: "name" | "price" | "prepTimeMinutes",
    value: string,
  ) => {
    await fetch("/api/menu/manage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId,
        [field]:
          field === "name"
            ? value
            : field === "prepTimeMinutes"
              ? parseInt(value, 10) || 10
              : parseFloat(value),
      }),
    });
    await fetchMenu();
  };

  const deleteItem = async (itemId: string) => {
    if (!confirm("Remove this item from the menu?")) return;
    await fetch("/api/menu/manage", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    });
    await fetchMenu();
  };

  const saveRewardSettings = async () => {
    setSavingRewards(true);
    await fetch("/api/rewards/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rewardSettings),
    });
    setSavingRewards(false);
    flash("Reward settings saved");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-shell">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  const existingSlugs = new Set(categories.map((c) => c.slug));
  const missingPresets = QUICK_PRESETS.filter((p) => !existingSlugs.has(p.slug));

  return (
    <div className="min-h-screen bg-app-shell text-foreground pb-10">
      <header className="border-b border-white/5 px-4 py-4 sticky top-0 z-30 bg-app-shell/95 backdrop-blur-md">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link href="/staff/dashboard" className="p-2 rounded-xl bg-white/5 hover:bg-white/10">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold">Menu builder</h1>
            <p className="text-sm text-zinc-400">
              Add categories and items — disable temporarily to hide from QR menu and digital boards
            </p>
          </div>
          {restaurantSlug && (
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button type="button" variant="secondary" size="sm" onClick={openDigitalDisplay}>
                <Monitor className="w-4 h-4" />
                Digital display
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={openPrintMenu}>
                <Printer className="w-4 h-4" />
                Print menu
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {(message || error) && (
          <div
            className={`rounded-xl px-4 py-3 text-sm ${
              error ? "bg-red-500/10 text-red-300 border border-red-500/30" : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
            }`}
          >
            {error || message}
          </div>
        )}

        {restaurantSlug && (
          <Card className="p-5 border border-cyan-500/20 bg-cyan-500/5 space-y-3">
            <div>
              <h2 className="font-semibold text-lg flex items-center gap-2">
                <Monitor className="w-5 h-5 text-cyan-400" />
                Digital menu board
              </h2>
              <p className="text-sm text-zinc-400 mt-1">
                Open on a TV or tablet at {restaurantName || "your restaurant"}. It refreshes every
                30 seconds and only shows enabled categories with live items.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={openDigitalDisplay}>
                <Monitor className="w-4 h-4" />
                Open display screen
              </Button>
              <Button type="button" variant="secondary" onClick={openPrintMenu}>
                <Printer className="w-4 h-4" />
                Print menu (PDF)
              </Button>
            </div>
            <p className="text-xs text-zinc-500 break-all">
              Display path: /display/menu/{restaurantSlug}
            </p>
          </Card>
        )}

        <Card className="p-5 space-y-4 border border-orange-500/20">
          <div className="flex items-start gap-3">
            <FolderPlus className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <h2 className="font-semibold text-lg">Menu categories</h2>
              <p className="text-sm text-zinc-400">
                Tap a quick category below or type your own. Then open each category to add items
                with price and prep time.
              </p>
            </div>
          </div>

          {categories.length === 0 && (
            <Button onClick={() => void bootstrapMenu()} disabled={addingPresets} className="w-full sm:w-auto">
              <Sparkles className="w-4 h-4" />
              {addingPresets ? "Setting up…" : "Add all starter categories"}
            </Button>
          )}

          {missingPresets.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Quick add</p>
              <div className="flex flex-wrap gap-2">
                {missingPresets.map((preset) => (
                  <button
                    key={preset.slug}
                    type="button"
                    disabled={addingPresets}
                    onClick={() => void addQuickPreset(preset)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-white/5 hover:bg-orange-500/15 border border-white/10 hover:border-orange-500/30 text-sm transition-colors"
                  >
                    <span>{preset.icon}</span>
                    {preset.name}
                    <Plus className="w-3.5 h-3.5 opacity-60" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={addCustomCategory} className="grid sm:grid-cols-[4rem_1fr_auto] gap-2">
            <Input
              value={newCategoryIcon}
              onChange={(e) => setNewCategoryIcon(e.target.value.slice(0, 4))}
              maxLength={4}
              className="text-center text-lg"
              title="Category emoji"
            />
            <Input
              placeholder="Custom category name, e.g. Combos"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
            />
            <Button type="submit" disabled={addingCategory || !newCategoryName.trim()}>
              {addingCategory ? "Adding…" : "Add category"}
            </Button>
          </form>
        </Card>

        {categories.length === 0 ? (
          <Card className="p-10 text-center space-y-3">
            <p className="text-zinc-400">No categories yet.</p>
            <p className="text-sm text-zinc-500">
              Use quick add above or “Add all starter categories” to get Biryanis, Tea, Snacks, and
              more in one click.
            </p>
          </Card>
        ) : (
          categories.map((cat) => {
            const isOpen = expanded[cat.id] ?? true;
            return (
              <Card key={cat.id} className={`overflow-hidden ${!cat.isEnabled ? "opacity-70" : ""}`}>
                <div className="flex items-center gap-2 p-4 border-b border-white/5">
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => ({ ...prev, [cat.id]: !isOpen }))}
                    className="flex flex-1 items-center gap-3 min-w-0 text-left"
                  >
                    <span className="text-2xl shrink-0">{cat.icon ?? "🍽️"}</span>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-semibold text-lg truncate">{cat.name}</h2>
                      <p className="text-xs text-zinc-500">
                        {cat.items.length} item{cat.items.length === 1 ? "" : "s"}
                        {!cat.isEnabled ? " · hidden from menu" : ""}
                        {cat.slug === "todays-special" ? " · only one live special at a time" : ""}
                      </p>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="w-5 h-5 text-zinc-500 shrink-0" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-zinc-500 shrink-0" />
                    )}
                  </button>
                  <Button
                    type="button"
                    size="sm"
                    variant={cat.isEnabled ? "secondary" : "success"}
                    disabled={togglingCategoryId === cat.id}
                    onClick={() => void toggleCategoryEnabled(cat)}
                  >
                    {togglingCategoryId === cat.id
                      ? "…"
                      : cat.isEnabled
                        ? "Disable"
                        : "Enable"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => void deleteCategory(cat)}
                    className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                    title="Delete empty category"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {isOpen && (
                  <div className="p-4 space-y-3">
                    <AddItemForm
                      categoryId={cat.id}
                      categoryName={cat.name}
                      onAdded={fetchMenu}
                    />
                    {cat.items.length === 0 ? (
                      <p className="text-sm text-zinc-500 text-center py-6">
                        No items yet — add your first {cat.name.toLowerCase()} item above
                      </p>
                    ) : (
                      cat.items.map((item) => (
                        <ItemRow
                          key={item.id}
                          item={item}
                          toggling={togglingItemId === item.id}
                          onToggle={toggleAvailability}
                          onUpdate={updateItem}
                          onDelete={deleteItem}
                        />
                      ))
                    )}
                  </div>
                )}
              </Card>
            );
          })
        )}

        <Card className="p-4">
          <button
            type="button"
            onClick={() => setShowRewards((v) => !v)}
            className="w-full flex items-center justify-between text-left"
          >
            <span className="font-medium text-zinc-300">Spin wheel rewards (optional)</span>
            {showRewards ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showRewards && (
            <div className="mt-4 space-y-3 pt-4 border-t border-white/5">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-500">Tea reward at (₹)</label>
                  <Input
                    type="number"
                    value={rewardSettings.rewardThresholdTea}
                    onChange={(e) =>
                      setRewardSettings((s) => ({
                        ...s,
                        rewardThresholdTea: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Beverage reward at (₹)</label>
                  <Input
                    type="number"
                    value={rewardSettings.rewardThresholdBeverage}
                    onChange={(e) =>
                      setRewardSettings((s) => ({
                        ...s,
                        rewardThresholdBeverage: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
              </div>
              <Input
                placeholder="Tea reward label"
                value={rewardSettings.rewardTeaLabel}
                onChange={(e) =>
                  setRewardSettings((s) => ({ ...s, rewardTeaLabel: e.target.value }))
                }
              />
              <Input
                placeholder="Beverage reward label"
                value={rewardSettings.rewardBeverageLabel}
                onChange={(e) =>
                  setRewardSettings((s) => ({ ...s, rewardBeverageLabel: e.target.value }))
                }
              />
              <Button onClick={() => void saveRewardSettings()} disabled={savingRewards} size="sm">
                {savingRewards ? "Saving…" : "Save reward settings"}
              </Button>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}

function ItemRow({
  item,
  toggling,
  onToggle,
  onUpdate,
  onDelete,
}: {
  item: MenuItem;
  toggling: boolean;
  onToggle: (id: string, available: boolean) => void;
  onUpdate: (id: string, field: "name" | "price" | "prepTimeMinutes", value: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Card className={`p-3 flex flex-col sm:flex-row sm:items-center gap-3 bg-white/[0.02] ${!item.isAvailable ? "opacity-75" : ""}`}>
      <div className="flex-1 grid sm:grid-cols-[1fr_6rem_5rem] gap-2">
        <Input
          defaultValue={item.name}
          onBlur={(e) => {
            if (e.target.value.trim() && e.target.value !== item.name) {
              onUpdate(item.id, "name", e.target.value.trim());
            }
          }}
          className="text-sm"
        />
        <Input
          type="number"
          defaultValue={item.price}
          onBlur={(e) => {
            if (e.target.value && parseFloat(e.target.value) !== item.price) {
              onUpdate(item.id, "price", e.target.value);
            }
          }}
          className="text-sm"
          min="0"
        />
        <Input
          type="number"
          defaultValue={item.prepTimeMinutes}
          onBlur={(e) => {
            const val = parseInt(e.target.value, 10);
            if (!Number.isNaN(val) && val !== item.prepTimeMinutes) {
              onUpdate(item.id, "prepTimeMinutes", String(val));
            }
          }}
          className="text-sm"
          min="1"
          max="120"
          title="Prep minutes"
        />
      </div>
      <div className="flex items-center gap-2 justify-between sm:justify-end shrink-0 flex-wrap">
        <Badge
          className={
            item.isAvailable
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              : "bg-red-500/15 text-red-400 border-red-500/30"
          }
        >
          {item.isAvailable ? "Live" : "Disabled"}
        </Badge>
        <span className="text-xs text-zinc-500">{formatCurrency(item.price)}</span>
        <Button
          type="button"
          size="sm"
          variant={item.isAvailable ? "secondary" : "success"}
          disabled={toggling}
          onClick={() => onToggle(item.id, item.isAvailable)}
        >
          {toggling ? "…" : item.isAvailable ? "Disable" : "Enable"}
        </Button>
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          className="p-1 text-zinc-500 hover:text-red-400"
          title="Delete item"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </Card>
  );
}

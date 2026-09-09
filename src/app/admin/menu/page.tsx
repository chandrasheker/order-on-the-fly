"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  FolderPlus,
  Monitor,
  ImagePlus,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { Button, Card, Spinner, Badge, Input } from "@/components/ui";
import { DietToggle } from "@/components/menu/DietToggle";
import { formatCurrency } from "@/lib/utils";
import { isOutOfStock } from "@/lib/menu-stock";

interface MenuItem {
  id: string;
  name: string;
  price: number;
  prepTimeMinutes: number;
  isAvailable: boolean;
  isVeg: boolean;
  imageUrl?: string | null;
  imageRevision?: number;
  trackInventory?: boolean;
  stockQuantity?: number | null;
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

const MENU_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

function AddItemForm({
  categoryId,
  onAdded,
}: {
  categoryId: string;
  onAdded: (notice?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [prepTimeMinutes, setPrepTimeMinutes] = useState("10");
  const [isVeg, setIsVeg] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [stockQuantity, setStockQuantity] = useState("");

  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview("");
  };

  const reset = () => {
    setName("");
    setPrice("");
    setPrepTimeMinutes("10");
    setIsVeg(true);
    setStockQuantity("");
    clearImage();
    setError("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !price || saving) return;
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
        isVeg,
        ...(stockQuantity.trim() !== "" ? { stockQuantity: parseInt(stockQuantity, 10) } : {}),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setSaving(false);
      setError(json.error || "Could not add item");
      return;
    }

    let notice: string | undefined;
    const createdId = json.item?.id as string | undefined;
    if (createdId && imageFile) {
      const body = new FormData();
      body.set("file", imageFile);
      const upload = await fetch(`/api/menu/manage/${createdId}/image`, {
        method: "POST",
        body,
      });
      if (!upload.ok) {
        notice =
          "Item was created, but photo upload failed. You can retry from the item.";
      }
    }

    reset();
    setSaving(false);
    setOpen(false);
    onAdded(notice);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-orange-500/30 bg-orange-500/5 px-3 py-2.5 text-sm font-medium text-orange-800 dark:text-orange-200 hover:bg-orange-500/10"
      >
        <Plus className="w-4 h-4" />
        Add item
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-orange-500/25 bg-orange-500/5 p-3 space-y-2">
      <div className="grid sm:grid-cols-[1fr_6.5rem_5.5rem_auto] gap-2">
        <label className="block space-y-1 min-w-0">
          <span className="text-[11px] font-medium text-muted">Item name</span>
          <Input
            placeholder="e.g. Mineral Water"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-muted">Price (₹)</span>
          <Input
            type="number"
            placeholder="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
            min="0"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-muted">Qty</span>
          <Input
            type="number"
            min="0"
            placeholder="Optional"
            title="Same stock field as Operations → Inventory"
            value={stockQuantity}
            onChange={(e) => setStockQuantity(e.target.value)}
          />
        </label>
        <div className="flex items-end">
          <Button type="submit" disabled={saving} size="sm">
            {saving ? "…" : "Add"}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <DietToggle isVeg={isVeg} onChange={setIsVeg} disabled={saving} />
        <label className="space-y-1">
          <span className="block text-[11px] font-medium text-muted">Prep (min)</span>
          <Input
            type="number"
            value={prepTimeMinutes}
            onChange={(e) => setPrepTimeMinutes(e.target.value)}
            min="1"
            max="120"
            className="w-20"
          />
        </label>
        <label className="inline-flex items-center gap-2 text-xs text-muted cursor-pointer h-10 px-2 rounded-lg border border-white/10">
          <ImagePlus className="w-4 h-4" />
          {imageFile ? imageFile.name : "Photo"}
          <input
            type="file"
            accept={MENU_IMAGE_ACCEPT}
            className="sr-only"
            disabled={saving}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              if (imagePreview) URL.revokeObjectURL(imagePreview);
              setImageFile(file);
              setImagePreview(file ? URL.createObjectURL(file) : "");
              e.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="ml-auto text-xs text-muted hover:text-foreground"
        >
          Cancel
        </button>
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
  const [togglingCategoryId, setTogglingCategoryId] = useState<string | null>(null);
  const [togglingItemId, setTogglingItemId] = useState<string | null>(null);

  const fetchMenu = useCallback(async () => {
    try {
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
      const nextCategories = (menuData.categories ?? []) as Category[];
      setCategories(nextCategories);
      setExpanded((prev) => {
        if (Object.keys(prev).length > 0) return prev;
        const first = nextCategories[0];
        return first ? { [first.id]: true } : prev;
      });
      if (settingsRes.ok) {
        const s = await settingsRes.json();
        setRewardSettings(s.settings);
      }
      if (meRes.ok) {
        const me = await meRes.json();
        setRestaurantSlug(me.user?.restaurantSlug ?? "");
      }
    } catch {
      /* ignore network errors */
    } finally {
      setLoading(false);
    }
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
      body: JSON.stringify({ name: newCategoryName.trim(), icon: "🍽️" }),
    });
    const json = await res.json();
    setAddingCategory(false);
    if (!res.ok) {
      flash(json.error || "Could not add category", true);
      return;
    }
    setNewCategoryName("");
    setExpanded({ [json.category.id]: true });
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
      setExpanded({ [created.id]: true });
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
    flash(
      category.isEnabled
        ? `Hidden ${category.name} from guests. Item live/disabled settings are unchanged.`
        : `Showing ${category.name} again. Items kept their previous live/disabled state.`,
    );
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

  const updateItemDiet = async (itemId: string, nextIsVeg: boolean) => {
    await fetch("/api/menu/manage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, isVeg: nextIsVeg }),
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
      <div className="flex justify-center py-16">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  const existingSlugs = new Set(categories.map((c) => c.slug));
  const missingPresets = QUICK_PRESETS.filter((p) => !existingSlugs.has(p.slug));

  return (
    <div className="space-y-6">
        {(message || error) && (
          <div
            className={`rounded-xl px-4 py-3 text-sm ${
              error ? "bg-red-500/10 text-red-300 border border-red-500/30" : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
            }`}
          >
            {error || message}
          </div>
        )}

        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="order-1 lg:order-2 lg:col-start-2 space-y-6 lg:sticky lg:top-24">
        <Card className="p-4 space-y-2 border border-amber-500/25 bg-amber-500/5">
          <h2 className="font-semibold flex items-center gap-2">
            <Upload className="w-4 h-4 text-amber-400" />
            Import existing menu
          </h2>
          <p className="text-sm text-muted">PDF or photos. Review the draft before it goes live.</p>
          <Link href="/admin/menu/import">
            <Button type="button" variant="secondary" size="sm">
              <Upload className="w-4 h-4" />
              Import
            </Button>
          </Link>
        </Card>

        {restaurantSlug && (
          <Card className="p-4 space-y-2 border border-cyan-500/20 bg-cyan-500/5">
            <h2 className="font-semibold flex items-center gap-2">
              <Monitor className="w-4 h-4 text-cyan-400" />
              Digital menu board
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={openDigitalDisplay}>
                Open display
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={openPrintMenu}>
                Print PDF
              </Button>
            </div>
          </Card>
        )}
        </div>

        <div className="order-2 lg:order-1 lg:col-start-1 space-y-6">
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FolderPlus className="w-4 h-4 text-orange-400" />
            <h2 className="font-semibold">Categories</h2>
          </div>
          {categories.length === 0 && (
            <Button onClick={() => void bootstrapMenu()} disabled={addingPresets} size="sm">
              <Sparkles className="w-4 h-4" />
              {addingPresets ? "Setting up…" : "Add starter categories"}
            </Button>
          )}
          {missingPresets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {missingPresets.map((preset) => (
                <button
                  key={preset.slug}
                  type="button"
                  disabled={addingPresets}
                  onClick={() => void addQuickPreset(preset)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 hover:bg-orange-500/15 border border-white/10 text-xs"
                >
                  {preset.icon} {preset.name}
                  <Plus className="w-3 h-3 opacity-60" />
                </button>
              ))}
            </div>
          )}
          <form onSubmit={addCustomCategory} className="flex gap-2">
            <Input
              placeholder="New category name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
            />
            <Button type="submit" disabled={addingCategory || !newCategoryName.trim()} size="sm">
              {addingCategory ? "…" : "Add"}
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
            const isOpen = Boolean(expanded[cat.id]);
            const liveCount = cat.items.filter((item) => item.isAvailable && !isOutOfStock(item)).length;
            return (
              <Card key={cat.id} className="overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? {} : { [cat.id]: true })}
                    className="flex flex-1 items-center gap-2.5 min-w-0 text-left"
                  >
                    <span className="text-xl shrink-0">{cat.icon ?? "🍽️"}</span>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-medium truncate">{cat.name}</h2>
                      <p className="text-xs text-muted">
                        {cat.items.length} item{cat.items.length === 1 ? "" : "s"}
                        {cat.items.length > 0 ? ` · ${liveCount} live` : ""}
                        {!cat.isEnabled ? " · hidden from guests" : ""}
                      </p>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-muted shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted shrink-0" />
                    )}
                  </button>
                  <Button
                    type="button"
                    size="sm"
                    variant={cat.isEnabled ? "secondary" : "success"}
                    disabled={togglingCategoryId === cat.id}
                    onClick={() => void toggleCategoryEnabled(cat)}
                    title="Hides the category from guests. Item live/disabled settings stay as they are."
                  >
                    {togglingCategoryId === cat.id ? "…" : cat.isEnabled ? "Hide" : "Show"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => void deleteCategory(cat)}
                    className="p-1.5 rounded-lg text-muted hover:text-red-400"
                    title="Delete empty category"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {isOpen && (
                  <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-3">
                    {!cat.isEnabled ? (
                      <p className="text-xs text-muted">
                        Hidden from guests. Each item keeps its own live or disabled state.
                      </p>
                    ) : null}
                    {cat.items.map((item) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        toggling={togglingItemId === item.id}
                        onToggle={toggleAvailability}
                        onUpdate={updateItem}
                        onDietChange={updateItemDiet}
                        onDelete={deleteItem}
                        onChanged={fetchMenu}
                        onNotice={flash}
                      />
                    ))}
                    <AddItemForm
                      categoryId={cat.id}
                      onAdded={async (notice) => {
                        if (notice) flash(notice, true);
                        await fetchMenu();
                      }}
                    />
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
        </div>
        </div>
    </div>
  );
}

function ItemRow({
  item,
  toggling,
  onToggle,
  onUpdate,
  onDietChange,
  onDelete,
  onChanged,
  onNotice,
}: {
  item: MenuItem;
  toggling: boolean;
  onToggle: (id: string, available: boolean) => void;
  onUpdate: (id: string, field: "name" | "price" | "prepTimeMinutes", value: string) => void;
  onDietChange: (id: string, isVeg: boolean) => void;
  onDelete: (id: string) => void;
  onChanged: () => void;
  onNotice: (text: string, isError?: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const outOfStock = isOutOfStock(item);

  const uploadImage = async (file: File) => {
    if (imageBusy) return;
    setImageBusy(true);
    const body = new FormData();
    body.set("file", file);
    const res = await fetch(`/api/menu/manage/${item.id}/image`, { method: "POST", body });
    const json = await res.json().catch(() => ({}));
    setImageBusy(false);
    if (!res.ok) {
      onNotice(json.error || "Photo upload failed. The previous image is unchanged.", true);
      return;
    }
    onNotice(item.imageUrl ? "Photo replaced" : "Photo uploaded");
    onChanged();
  };

  const removeImage = async () => {
    if (imageBusy || !item.imageUrl) return;
    setImageBusy(true);
    const res = await fetch(`/api/menu/manage/${item.id}/image`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setImageBusy(false);
    if (!res.ok) {
      onNotice(json.error || "Could not remove photo", true);
      return;
    }
    onNotice("Photo removed");
    onChanged();
  };

  const statusLabel = outOfStock ? "Out of stock" : item.isAvailable ? "Live" : "Off";
  const statusClass = outOfStock || !item.isAvailable
    ? "bg-red-500/15 text-red-400 border-red-500/30"
    : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02]">
      <div className="flex items-center gap-2 px-2.5 py-2 flex-wrap">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover bg-black/20 shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-zinc-500 shrink-0">
            <ImagePlus className="w-4 h-4" />
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="min-w-0 flex-1 text-left"
        >
          <p className="text-sm font-medium truncate">{item.name}</p>
          <p className="text-xs text-muted">
            {formatCurrency(item.price)}
            {" · "}
            {item.prepTimeMinutes} min serve
            {" · "}
            {item.trackInventory
              ? item.stockQuantity == null
                ? "Qty —"
                : `Qty ${item.stockQuantity}`
              : "Qty not tracked"}
          </p>
        </button>
        <DietToggle isVeg={item.isVeg !== false} onChange={(next) => onDietChange(item.id, next)} size="sm" />
        <label className="space-y-0.5">
          <span className="block text-[10px] font-medium text-muted">Prep</span>
          <Input
            type="number"
            defaultValue={item.prepTimeMinutes}
            key={`${item.id}-prep-${item.prepTimeMinutes}`}
            onBlur={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!Number.isNaN(val) && val !== item.prepTimeMinutes) {
                onUpdate(item.id, "prepTimeMinutes", String(val));
              }
            }}
            className="w-16 h-8 text-sm"
            min="1"
            max="120"
          />
        </label>
        <label className="inline-flex items-center gap-1 text-xs text-orange-200 cursor-pointer">
          <ImagePlus className="w-3.5 h-3.5" />
          Photo
          <input
            type="file"
            accept={MENU_IMAGE_ACCEPT}
            className="sr-only"
            disabled={imageBusy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void uploadImage(file);
            }}
          />
        </label>
        <Badge className={statusClass}>{statusLabel}</Badge>
        <Button
          type="button"
          size="sm"
          variant={item.isAvailable ? "secondary" : "success"}
          disabled={toggling}
          onClick={() => onToggle(item.id, item.isAvailable)}
          title="Turns this item on or off. Hiding the category does not change this."
        >
          {toggling ? "…" : item.isAvailable ? "Hide" : "Show"}
        </Button>
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          className="p-1.5 text-muted hover:text-red-400"
          title="Delete item"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="p-1 text-muted"
          title={open ? "Close details" : "Edit name, price, and quantity"}
        >
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {open && (
        <div className="grid sm:grid-cols-3 gap-2 px-2.5 pb-2.5">
          <label className="block space-y-1 min-w-0">
            <span className="text-[11px] font-medium text-muted">Item name</span>
            <Input
              defaultValue={item.name}
              key={`${item.id}-name`}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== item.name) {
                  onUpdate(item.id, "name", e.target.value.trim());
                }
              }}
              className="text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted">Price (₹)</span>
            <Input
              type="number"
              defaultValue={item.price}
              key={`${item.id}-price-${item.price}`}
              onBlur={(e) => {
                if (e.target.value && parseFloat(e.target.value) !== item.price) {
                  onUpdate(item.id, "price", e.target.value);
                }
              }}
              className="text-sm"
              min="0"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted">Qty (same as Inventory)</span>
            <Input
              type="number"
              min="0"
              key={`${item.id}-qty-${item.stockQuantity}-${item.trackInventory}`}
              defaultValue={item.trackInventory ? (item.stockQuantity ?? "") : ""}
              placeholder="Optional"
              className="text-sm"
              onBlur={(e) => {
                const raw = e.target.value.trim();
                if (raw === "") {
                  if (item.trackInventory) {
                    void fetch("/api/menu/manage", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ itemId: item.id, trackInventory: false }),
                    }).then(() => onChanged());
                  }
                  return;
                }
                const qty = parseInt(raw, 10);
                if (Number.isNaN(qty) || qty === item.stockQuantity) return;
                void fetch("/api/menu/manage", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ itemId: item.id, trackInventory: true, stockQuantity: qty }),
                }).then(() => onChanged());
              }}
            />
          </label>
          {item.imageUrl ? (
            <button
              type="button"
              disabled={imageBusy}
              onClick={() => void removeImage()}
              className="text-xs text-muted hover:text-red-300 disabled:opacity-50 sm:col-span-3 text-left"
            >
              Remove photo
            </button>
          ) : null}
          {imageBusy && <span className="text-xs text-muted sm:col-span-3">Saving photo…</span>}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Spinner, Badge, Input } from "@/components/ui";
import { ArrowLeft, ToggleLeft, ToggleRight, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
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
  items: MenuItem[];
}

function AddItemForm({
  categoryId,
  label,
  onAdded,
}: {
  categoryId: string;
  label?: string;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !price) return;
    setSaving(true);
    await fetch("/api/menu/manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, name: name.trim(), price }),
    });
    setName("");
    setPrice("");
    setSaving(false);
    onAdded();
  };

  return (
    <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20">
      <Input
        placeholder={label ?? "Item name"}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        className="flex-1"
      />
      <Input
        type="number"
        placeholder="Price ₹"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        required
        min="0"
        className="w-full sm:w-28"
      />
      <Button type="submit" disabled={saving} size="md">
        <Plus className="w-4 h-4" /> Add
      </Button>
    </form>
  );
}

export default function MenuManagePage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [rewardSettings, setRewardSettings] = useState({
    rewardThresholdTea: 250,
    rewardThresholdBeverage: 500,
    rewardTeaLabel: "",
    rewardBeverageLabel: "",
  });
  const [savingRewards, setSavingRewards] = useState(false);

  const fetchMenu = () => {
    Promise.all([
      fetch("/api/menu/manage"),
      fetch("/api/rewards/settings"),
    ])
      .then(async ([menuRes, settingsRes]) => {
        if (!menuRes.ok) {
          router.push("/");
          return;
        }
        const menuData = await menuRes.json();
        setCategories(menuData.categories);
        if (settingsRes.ok) {
          const s = await settingsRes.json();
          setRewardSettings(s.settings);
        }
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchMenu();
  }, []);

  const toggleAvailability = async (itemId: string, isAvailable: boolean) => {
    await fetch("/api/menu/manage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, isAvailable: !isAvailable }),
    });
    fetchMenu();
  };

  const updateItem = async (itemId: string, field: "name" | "price", value: string) => {
    await fetch("/api/menu/manage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId,
        [field]: field === "price" ? parseFloat(value) : value,
      }),
    });
    fetchMenu();
  };

  const deleteItem = async (itemId: string) => {
    if (!confirm("Remove this item from the menu?")) return;
    await fetch("/api/menu/manage", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    });
    fetchMenu();
  };

  const saveRewardSettings = async () => {
    setSavingRewards(true);
    await fetch("/api/rewards/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rewardSettings),
    });
    setSavingRewards(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a12]">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  const todaysSpecial = categories.find((c) => c.slug === "todays-special");
  const otherCategories = categories.filter((c) => c.slug !== "todays-special");

  return (
    <div className="min-h-screen bg-[#0a0a12] text-white">
      <header className="border-b border-white/5 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link href="/staff/dashboard" className="p-2 rounded-xl bg-white/5 hover:bg-white/10">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Menu</h1>
            <p className="text-sm text-zinc-400">Add items, set prices, manage availability</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-8">
        <section>
          <h2 className="text-lg font-bold mb-3">🎁 Spin Wheel Rewards</h2>
          <p className="text-sm text-zinc-500 mb-3">
            Tea reward applies from the tea amount up to (but not including) the beverage amount.
            Beverage reward applies at the beverage amount and above. Rewards expire 48 hours after claim.
          </p>
          <Card className="p-4 space-y-3">
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
            <Button onClick={saveRewardSettings} disabled={savingRewards} size="sm">
              {savingRewards ? "Saving..." : "Save Reward Settings"}
            </Button>
          </Card>
        </section>

        {todaysSpecial && (
          <section>
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <span>{todaysSpecial.icon}</span> Today&apos;s Special
            </h2>
            <p className="text-sm text-zinc-500 mb-3">
              Add today&apos;s special dish. Only one special is shown to customers at a time.
            </p>
            <AddItemForm
              categoryId={todaysSpecial.id}
              label="Special name, e.g. Chef's Biryani"
              onAdded={fetchMenu}
            />
            <div className="mt-3 space-y-2">
              {todaysSpecial.items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onToggle={toggleAvailability}
                  onUpdate={updateItem}
                  onDelete={deleteItem}
                />
              ))}
              {todaysSpecial.items.length === 0 && (
                <p className="text-sm text-zinc-500 py-4 text-center">No special added yet</p>
              )}
            </div>
          </section>
        )}

        {otherCategories.map((cat) => (
          <section key={cat.id}>
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <span>{cat.icon}</span> {cat.name}
            </h2>
            <AddItemForm categoryId={cat.id} onAdded={fetchMenu} />
            <div className="mt-3 space-y-2">
              {cat.items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onToggle={toggleAvailability}
                  onUpdate={updateItem}
                  onDelete={deleteItem}
                />
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

function ItemRow({
  item,
  onToggle,
  onUpdate,
  onDelete,
}: {
  item: MenuItem;
  onToggle: (id: string, available: boolean) => void;
  onUpdate: (id: string, field: "name" | "price", value: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Card className="p-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 flex gap-2">
        <Input
          defaultValue={item.name}
          onBlur={(e) => {
            if (e.target.value.trim() && e.target.value !== item.name) {
              onUpdate(item.id, "name", e.target.value.trim());
            }
          }}
          className="flex-1 text-sm"
        />
        <Input
          type="number"
          defaultValue={item.price}
          onBlur={(e) => {
            if (e.target.value && parseFloat(e.target.value) !== item.price) {
              onUpdate(item.id, "price", e.target.value);
            }
          }}
          className="w-24 text-sm"
          min="0"
        />
      </div>
      <div className="flex items-center gap-2 justify-between sm:justify-end">
        <Badge
          className={
            item.isAvailable
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              : "bg-red-500/15 text-red-400 border-red-500/30"
          }
        >
          {item.isAvailable ? "Live" : "Off"}
        </Badge>
        <span className="text-xs text-zinc-500 hidden sm:inline">
          {formatCurrency(item.price)}
        </span>
        <button onClick={() => onToggle(item.id, item.isAvailable)} className="p-1">
          {item.isAvailable ? (
            <ToggleRight className="w-7 h-7 text-emerald-400" />
          ) : (
            <ToggleLeft className="w-7 h-7 text-zinc-500" />
          )}
        </button>
        <button
          onClick={() => onDelete(item.id)}
          className="p-1 text-zinc-500 hover:text-red-400"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </Card>
  );
}

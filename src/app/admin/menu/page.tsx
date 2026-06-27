"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button, Card, Spinner, Badge } from "@/components/ui";
import { ArrowLeft, ToggleLeft, ToggleRight, Clock } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  prepTimeMinutes: number;
  isAvailable: boolean;
  isVeg: boolean;
}

interface Category {
  id: string;
  name: string;
  icon: string | null;
  items: MenuItem[];
}

export default function MenuManagePage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMenu = () => {
    fetch("/api/menu/manage")
      .then((r) => {
        if (!r.ok) { router.push("/staff/login"); return null; }
        return r.json();
      })
      .then((data) => {
        if (data) setCategories(data.categories);
        setLoading(false);
      });
  };

  useEffect(() => { fetchMenu(); }, []);

  const toggleAvailability = async (itemId: string, isAvailable: boolean) => {
    await fetch("/api/menu/manage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, isAvailable: !isAvailable }),
    });
    fetchMenu();
  };

  const updatePrepTime = async (itemId: string, prepTimeMinutes: number) => {
    await fetch("/api/menu/manage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, prepTimeMinutes }),
    });
    fetchMenu();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a12]">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a12] text-white">
      <header className="border-b border-white/5 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link href="/staff/dashboard" className="p-2 rounded-xl bg-white/5 hover:bg-white/10">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Menu Management</h1>
            <p className="text-sm text-zinc-400">Toggle availability & set prep times</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {categories.map((cat) => (
          <motion.div key={cat.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <span>{cat.icon}</span> {cat.name}
            </h2>
            <div className="space-y-2">
              {cat.items.map((item) => (
                <Card key={item.id} className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.name}</span>
                      <Badge className={item.isAvailable ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-red-500/15 text-red-400 border-red-500/30"}>
                        {item.isAvailable ? "Available" : "Unavailable"}
                      </Badge>
                    </div>
                    <p className="text-sm text-zinc-400">{formatCurrency(item.price)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-zinc-500" />
                    <select
                      value={item.prepTimeMinutes}
                      onChange={(e) => updatePrepTime(item.id, parseInt(e.target.value))}
                      className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm text-white"
                    >
                      {[1, 3, 5, 8, 10, 12, 15, 18, 20, 25, 30].map((m) => (
                        <option key={m} value={m} className="bg-[#1a1a2e]">{m} min</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => toggleAvailability(item.id, item.isAvailable)}
                    className="text-2xl"
                  >
                    {item.isAvailable ? (
                      <ToggleRight className="w-8 h-8 text-emerald-400" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-zinc-500" />
                    )}
                  </button>
                </Card>
              ))}
            </div>
          </motion.div>
        ))}
      </main>
    </div>
  );
}

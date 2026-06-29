"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Spinner, Badge } from "@/components/ui";
import { LogOut, Shield, Save, Download, Users } from "lucide-react";
import type { Role } from "@/generated/prisma/client";
import { DEFAULT_SLOT_COUNTS } from "@/lib/staff-permissions";

interface SlotRow {
  slotKey: string;
  role: Role;
  userId: string | null;
  name: string;
  email: string;
  password: string;
}

interface RestaurantConfig {
  id: string;
  name: string;
  slug: string;
  staffConfigured: boolean;
  counts: { owner: number; manager: number; cook: number; server: number };
  slots: Array<Omit<SlotRow, "password">>;
}

function buildSlotsFromCounts(
  restaurant: RestaurantConfig,
  drafts: Record<string, SlotRow>
): SlotRow[] {
  return restaurant.slots.map((slot) => ({
    ...slot,
    password: drafts[slot.slotKey]?.password ?? "",
    name: drafts[slot.slotKey]?.name ?? slot.name,
    email: drafts[slot.slotKey]?.email ?? slot.email,
  }));
}

function slotsForCounts(
  slug: string,
  counts: RestaurantConfig["counts"],
  existing: SlotRow[]
): SlotRow[] {
  const keys: Array<{ slotKey: string; role: Role }> = [];
  for (let i = 1; i <= counts.owner; i++) keys.push({ slotKey: `owner${i}`, role: "OWNER" });
  for (let i = 1; i <= counts.manager; i++) keys.push({ slotKey: `manager${i}`, role: "MANAGER" });
  for (let i = 1; i <= counts.cook; i++) keys.push({ slotKey: `cook${i}`, role: "COOK" });
  for (let i = 1; i <= counts.server; i++) keys.push({ slotKey: `server${i}`, role: "SERVER" });

  const byKey = new Map(existing.map((s) => [s.slotKey, s]));
  return keys.map(({ slotKey, role }) => {
    const prev = byKey.get(slotKey);
    return {
      slotKey,
      role,
      userId: prev?.userId ?? null,
      name: prev?.name ?? `${role.charAt(0)}${role.slice(1).toLowerCase()} ${slotKey.replace(/\D/g, "")}`,
      email: prev?.email ?? `${slotKey}@${slug}.com`,
      password: prev?.password ?? "",
    };
  });
}

export default function PlatformUsersPage() {
  const router = useRouter();
  const [admin, setAdmin] = useState<{ name: string; email: string } | null>(null);
  const [restaurants, setRestaurants] = useState<RestaurantConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [countsDraft, setCountsDraft] = useState<Record<string, RestaurantConfig["counts"]>>({});
  const [slotDrafts, setSlotDrafts] = useState<Record<string, Record<string, SlotRow>>>({});
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    const [meRes, configRes] = await Promise.all([
      fetch("/api/platform/auth/me"),
      fetch("/api/platform/staff-config"),
    ]);

    if (!meRes.ok) {
      router.push("/platform/login");
      return;
    }

    const me = await meRes.json();
    setAdmin(me.admin);

    if (configRes.ok) {
      const data = await configRes.json();
      const list = data.restaurants as RestaurantConfig[];
      setRestaurants(list);

      const nextCounts: typeof countsDraft = {};
      const nextSlots: typeof slotDrafts = {};
      for (const r of list) {
        nextCounts[r.id] = r.counts;
        nextSlots[r.id] = Object.fromEntries(
          buildSlotsFromCounts(r, {}).map((s) => [s.slotKey, s])
        );
      }
      setCountsDraft(nextCounts);
      setSlotDrafts(nextSlots);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const logout = async () => {
    await fetch("/api/platform/auth/logout", { method: "POST" });
    router.push("/platform/login");
  };

  const updateCount = (
    restaurantId: string,
    field: keyof RestaurantConfig["counts"],
    value: number
  ) => {
    setCountsDraft((prev) => {
      const counts = { ...prev[restaurantId], [field]: Math.max(0, value) };
      const restaurant = restaurants.find((r) => r.id === restaurantId);
      if (restaurant) {
        const currentSlots = Object.values(slotDrafts[restaurantId] ?? {});
        const nextSlots = slotsForCounts(restaurant.slug, counts, currentSlots);
        setSlotDrafts((s) => ({ ...s, [restaurantId]: Object.fromEntries(nextSlots.map((x) => [x.slotKey, x])) }));
      }
      return { ...prev, [restaurantId]: counts };
    });
  };

  const saveRestaurant = async (restaurantId: string) => {
    const counts = countsDraft[restaurantId];
    const slots = Object.values(slotDrafts[restaurantId] ?? {});
    if (!counts) return;

    setSavingId(restaurantId);
    setMessage(null);

    const res = await fetch("/api/platform/staff-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, ...counts, ownerSlots: counts.owner, managerSlots: counts.manager, cookSlots: counts.cook, serverSlots: counts.server, slots }),
    });

    if (res.ok) {
      setMessage({
        type: "ok",
        text: "Staff configuration saved. Passwords you entered are now active — use Download CSV to export them.",
      });
      await load();
    } else {
      const data = await res.json();
      setMessage({ type: "err", text: data.error || "Save failed" });
    }
    setSavingId(null);
  };

  const downloadCsv = (restaurantId: string, reset = false) => {
    window.location.href = `/api/platform/staff-export?restaurantId=${restaurantId}${reset ? "&reset=true" : ""}`;
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
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Staff setup</h1>
              <p className="text-sm text-zinc-400">
                {admin?.name} · {admin?.email}
              </p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={logout}>
            <LogOut className="w-4 h-4" /> Logout
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <p className="text-sm text-zinc-400">
          Configure how many owner, manager, cook, and server sessions each restaurant gets. Each
          slot is a unique login. Default: {DEFAULT_SLOT_COUNTS.owner} owner,{" "}
          {DEFAULT_SLOT_COUNTS.manager} managers, {DEFAULT_SLOT_COUNTS.cook} cooks,{" "}
          {DEFAULT_SLOT_COUNTS.server} servers.
        </p>

        {message && (
          <p
            className={`text-sm text-center ${
              message.type === "ok" ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {message.text}
          </p>
        )}

        {restaurants.map((restaurant) => {
          const counts = countsDraft[restaurant.id] ?? restaurant.counts;
          const slots = Object.values(slotDrafts[restaurant.id] ?? {});

          return (
            <Card key={restaurant.id} className="p-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-violet-400" />
                  <h2 className="text-lg font-semibold">{restaurant.name}</h2>
                  {restaurant.staffConfigured && (
                    <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                      Configured
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => downloadCsv(restaurant.id)}
                  >
                    <Download className="w-4 h-4" /> Download CSV
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => downloadCsv(restaurant.id, true)}
                  >
                    Reset &amp; export
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(
                  [
                    ["owner", "Owners"],
                    ["manager", "Managers"],
                    ["cook", "Cooks"],
                    ["server", "Servers"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label className="text-xs text-zinc-500 block mb-1">{label}</label>
                    <Input
                      type="number"
                      min={0}
                      value={counts[key]}
                      onChange={(e) =>
                        updateCount(restaurant.id, key, parseInt(e.target.value, 10) || 0)
                      }
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                {slots.map((slot) => (
                  <div
                    key={slot.slotKey}
                    className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{slot.slotKey}</span>
                      <Badge className="bg-violet-500/15 text-violet-300 border-violet-500/30 capitalize">
                        {slot.role.toLowerCase()}
                      </Badge>
                    </div>
                    <div className="grid sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-zinc-500 block mb-1">Name</label>
                        <Input
                          value={slot.name}
                          onChange={(e) =>
                            setSlotDrafts((prev) => ({
                              ...prev,
                              [restaurant.id]: {
                                ...prev[restaurant.id],
                                [slot.slotKey]: {
                                  ...prev[restaurant.id][slot.slotKey],
                                  name: e.target.value,
                                },
                              },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 block mb-1">Username (email)</label>
                        <Input
                          type="email"
                          value={slot.email}
                          onChange={(e) =>
                            setSlotDrafts((prev) => ({
                              ...prev,
                              [restaurant.id]: {
                                ...prev[restaurant.id],
                                [slot.slotKey]: {
                                  ...prev[restaurant.id][slot.slotKey],
                                  email: e.target.value,
                                },
                              },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 block mb-1">Password</label>
                        <Input
                          type="password"
                          placeholder="Leave blank to keep current"
                          value={slot.password}
                          onChange={(e) =>
                            setSlotDrafts((prev) => ({
                              ...prev,
                              [restaurant.id]: {
                                ...prev[restaurant.id],
                                [slot.slotKey]: {
                                  ...prev[restaurant.id][slot.slotKey],
                                  password: e.target.value,
                                },
                              },
                            }))
                          }
                          autoComplete="new-password"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                onClick={() => saveRestaurant(restaurant.id)}
                disabled={savingId === restaurant.id}
                className="w-full sm:w-auto"
              >
                {savingId === restaurant.id ? (
                  <Spinner />
                ) : (
                  <>
                    <Save className="w-4 h-4" /> Save staff configuration
                  </>
                )}
              </Button>

              <p className="text-xs text-zinc-500">
                Save first with the passwords you want staff to use. Download CSV exports those saved
                passwords without changing them. Use &quot;Reset &amp; export&quot; only if you need
                new random passwords.
              </p>
            </Card>
          );
        })}
      </main>
    </div>
  );
}

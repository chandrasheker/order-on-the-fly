"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Spinner, Badge } from "@/components/ui";
import { ArrowLeft, Gift, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

interface Reward {
  id: string;
  code: string;
  rewardType: string;
  rewardLabel: string;
  customerName: string;
  tableNumber: number;
  orderTotal: number;
  validDate: string;
  status: string;
  createdAt: string;
}

export default function RewardsPage() {
  const router = useRouter();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [filter, setFilter] = useState<"PENDING" | "REDEEMED" | "ALL">("PENDING");
  const [loading, setLoading] = useState(true);

  const fetchRewards = () => {
    fetch(`/api/rewards?status=${filter}`)
      .then((r) => {
        if (!r.ok) {
          router.push("/");
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data) setRewards(data.rewards);
        setLoading(false);
      });
  };

  useEffect(() => {
    setLoading(true);
    fetchRewards();
  }, [filter]);

  const redeem = async (id: string) => {
    await fetch(`/api/rewards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "redeem" }),
    });
    fetchRewards();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a12]">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  const pending = rewards.filter((r) => r.status === "PENDING");

  return (
    <div className="min-h-screen bg-[#0a0a12] text-white">
      <header className="border-b border-white/5 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link href="/staff/dashboard" className="p-2 rounded-xl bg-white/5 hover:bg-white/10">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Gift className="w-5 h-5 text-orange-400" />
              Pending Rewards
            </h1>
            <p className="text-sm text-zinc-400">Verify customer name & mark redeemed</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex gap-2 mb-6">
          {(["PENDING", "REDEEMED", "ALL"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-medium border ${
                filter === f
                  ? "bg-orange-500/20 border-orange-500/50 text-orange-300"
                  : "bg-white/5 border-white/10 text-zinc-400"
              }`}
            >
              {f === "PENDING" ? `Pending (${pending.length})` : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {rewards.length === 0 ? (
          <Card className="p-12 text-center">
            <Gift className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400">No rewards in this list.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {rewards.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-lg">{r.customerName}</span>
                      <Badge
                        className={
                          r.status === "PENDING"
                            ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                            : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        }
                      >
                        {r.status}
                      </Badge>
                    </div>
                    <p className="text-orange-300 font-medium">{r.rewardLabel}</p>
                    <p className="text-sm text-zinc-500 mt-1">
                      Code: <span className="font-mono text-zinc-300">{r.code}</span>
                      · Table {r.tableNumber}
                      · Order {formatCurrency(r.orderTotal)}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      Valid on: <strong className="text-zinc-400">{r.validDate}</strong>
                      · Claimed {new Date(r.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {r.status === "PENDING" && (
                    <Button variant="success" onClick={() => redeem(r.id)}>
                      <CheckCircle2 className="w-4 h-4" />
                      Mark Redeemed
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

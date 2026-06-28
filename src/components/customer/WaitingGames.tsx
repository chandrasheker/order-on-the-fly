"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, Button, Input } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { REWARD_DISCLAIMER } from "@/lib/reward-constants";

interface RewardSettings {
  rewardThresholdTea: number;
  rewardThresholdBeverage: number;
  rewardTeaLabel: string;
  rewardBeverageLabel: string;
}

interface LastOrder {
  id: string;
  total: number;
  orderNumber: number;
}

interface SpinStatus {
  eligible: boolean;
  spun: boolean;
  won: boolean;
  lost: boolean;
  claimed: boolean;
  tier: string;
}

const TRIVIA = [
  { q: "Which country invented pizza?", options: ["Italy", "USA", "France", "Greece"], answer: 0 },
  { q: "What spice makes curry yellow?", options: ["Paprika", "Turmeric", "Cumin", "Saffron"], answer: 1 },
  { q: "Dosa is made from?", options: ["Wheat", "Rice & Lentils", "Corn", "Barley"], answer: 1 },
];

const JOKES = [
  "Why did the tomato turn red? Because it saw the salad dressing! 🍅",
  "What do you call a fake noodle? An impasta! 🍝",
];

function RewardClaimModal({
  prize,
  rewardType,
  tableToken,
  lastOrder,
  customerName,
  onClose,
  onClaimed,
}: {
  prize: string;
  rewardType: "TEA" | "BEVERAGE";
  tableToken: string;
  lastOrder: LastOrder;
  customerName: string;
  onClose: () => void;
  onClaimed: () => void;
}) {
  const [name, setName] = useState(customerName);
  const [saving, setSaving] = useState(false);
  const [reward, setReward] = useState<{
    code: string;
    validDate: string;
    expiresAtFormatted?: string;
    rewardLabel: string;
  } | null>(null);

  const winHeadline =
    rewardType === "BEVERAGE" ? "You won a free beverage!" : "You won a free tea!";

  const claim = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/rewards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tableToken,
        orderId: lastOrder.id,
        customerName: name.trim(),
        rewardType,
        orderTotal: lastOrder.total,
      }),
    });
    setSaving(false);
    if (res.ok) {
      const data = await res.json();
      setReward(data.reward);
      onClaimed();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        className="w-full max-w-sm rounded-2xl bg-gradient-to-br from-orange-600/20 to-purple-600/20 border border-orange-500/30 p-6 text-center"
      >
        {!reward ? (
          <>
            <p className="text-4xl mb-2">🎉</p>
            <h3 className="text-xl font-bold text-orange-300 mb-1">{winHeadline}</h3>
            <p className="text-lg font-medium text-white mb-1">{prize}</p>
            <p className="text-sm text-zinc-400 mb-4">
              Valid for <strong className="text-white">48 hours</strong> after claim. Enter your name so staff can verify on your next visit.
            </p>
            <Input
              placeholder="Your full name *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mb-4"
            />
            <Button onClick={claim} disabled={!name.trim() || saving} className="w-full mb-2">
              {saving ? "Saving..." : "Claim Reward"}
            </Button>
            <button type="button" onClick={onClose} className="text-sm text-zinc-500">
              Skip
            </button>
          </>
        ) : (
          <>
            <p className="text-3xl mb-2">🎁</p>
            <h3 className="text-xl font-bold text-emerald-400 mb-2">Reward Saved!</h3>
            <div className="p-4 rounded-xl bg-black/40 border border-white/10 mb-4 text-left space-y-2">
              <p className="text-sm"><span className="text-zinc-500">Name:</span> {name}</p>
              <p className="text-sm"><span className="text-zinc-500">Reward:</span> {reward.rewardLabel}</p>
              <p className="text-sm"><span className="text-zinc-500">Code:</span> <span className="font-mono text-orange-400 font-bold">{reward.code}</span></p>
              <p className="text-sm">
                <span className="text-zinc-500">Expires:</span>{" "}
                {reward.expiresAtFormatted || reward.validDate}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-sm mb-4">
              📸 <strong>Take a screenshot now!</strong> Show this to staff within 48 hours.
            </div>
            <Button onClick={onClose} className="w-full">Got it!</Button>
          </>
        )}
        <p className="text-[10px] text-zinc-500 mt-4 leading-relaxed">* {REWARD_DISCLAIMER}</p>
      </motion.div>
    </motion.div>
  );
}

function SpinWheel({
  lastOrder,
  settings,
  tableToken,
  customerName,
}: {
  lastOrder: LastOrder;
  settings: RewardSettings;
  tableToken: string;
  customerName: string;
}) {
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [status, setStatus] = useState<SpinStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [showClaim, setShowClaim] = useState(false);
  const [wonPrize, setWonPrize] = useState<{ label: string; type: "TEA" | "BEVERAGE" } | null>(null);
  const [winReveal, setWinReveal] = useState<{ label: string; type: "TEA" | "BEVERAGE" } | null>(null);

  const mysterySegments = ["🎁", "✨", "🍀", "⭐"];
  const funSegments = ["✨", "🍀", "🎲", "⭐"];
  const segments = status?.eligible ? mysterySegments : funSegments;

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch(
        `/api/rewards/spin?orderId=${lastOrder.id}&tableToken=${encodeURIComponent(tableToken)}`
      );
      if (res.ok) {
        const data = await res.json();
        setStatus({
          eligible: data.eligible,
          spun: data.spun,
          won: data.won,
          lost: data.lost,
          claimed: data.claimed,
          tier: data.tier,
        });
        if (data.spun && data.won && !data.claimed && data.tier && data.tier !== "NONE") {
          setWonPrize({
            label:
              data.tier === "BEVERAGE"
                ? settings.rewardBeverageLabel
                : settings.rewardTeaLabel,
            type: data.tier === "BEVERAGE" ? "BEVERAGE" : "TEA",
          });
        }
      }
    } finally {
      setStatusLoading(false);
    }
  }, [lastOrder.id, tableToken, settings.rewardBeverageLabel, settings.rewardTeaLabel]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const spin = async () => {
    if (spinning || statusLoading) return;

    // Fun spin only — no reward tracking
    if (!status?.eligible) {
      setSpinning(true);
      const prizeIdx = Math.floor(Math.random() * segments.length);
      const newRot = rotation + 1440 + (360 - prizeIdx * (360 / segments.length));
      setRotation(newRot);
      setTimeout(() => setSpinning(false), 3000);
      return;
    }

    if (status.spun) return;

    setSpinning(true);

    try {
      const res = await fetch("/api/rewards/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableToken, orderId: lastOrder.id }),
      });

      if (!res.ok) {
        setSpinning(false);
        return;
      }

      const data = await res.json();
      if (data.alreadySpun) {
        await loadStatus();
        setSpinning(false);
        return;
      }

      const prizeIdx = data.prizeIdx ?? 0;
      const newRot = rotation + 1440 + (360 - prizeIdx * (360 / segments.length));
      setRotation(newRot);

      setTimeout(() => {
        setSpinning(false);
        setStatus({
          eligible: true,
          spun: true,
          won: data.won,
          lost: !data.won,
          claimed: false,
          tier: data.tier,
        });

        if (data.won) {
          const prize = {
            label: data.rewardLabel,
            type: data.rewardType as "TEA" | "BEVERAGE",
          };
          setWinReveal(prize);
          setWonPrize(prize);
          setTimeout(() => {
            setShowClaim(true);
          }, 1200);
        }
      }, 3000);
    } catch {
      setSpinning(false);
    }
  };

  const spinDisabled =
    statusLoading ||
    spinning ||
    (status?.eligible && status?.spun === true) ||
    (status?.eligible && status?.claimed && !showClaim);

  const buttonLabel = statusLoading
    ? "Loading..."
    : spinning
      ? "Spinning..."
      : !status?.eligible
        ? "🎡 Spin for Fun!"
        : status.claimed
          ? "Reward claimed ✓"
          : status.spun && status.won
            ? "Claim your reward"
            : "🎡 Spin the Wheel!";

  const teaserText = statusLoading
    ? null
    : status?.eligible && !status.spun
      ? "🎁 Your order unlocked a mystery reward — spin to reveal what you won!"
      : !status?.eligible
        ? "🎡 Pass the time with a lucky spin while your order is prepared!"
        : null;

  const winBannerText = winReveal
    ? winReveal.type === "BEVERAGE"
      ? `🎉 You won a free beverage — ${winReveal.label}!`
      : `🎉 You won a free tea — ${winReveal.label}!`
    : null;

  return (
    <div className="text-center space-y-4">
      <p className="text-sm text-zinc-400">
        Order #{lastOrder.orderNumber} · {formatCurrency(lastOrder.total)}
      </p>
      {teaserText && (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm font-medium text-orange-300 px-2"
        >
          {teaserText}
        </motion.p>
      )}
      <AnimatePresence>
        {winBannerText && !showClaim && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="p-4 rounded-2xl bg-gradient-to-r from-orange-500/20 to-emerald-500/20 border border-orange-500/40"
          >
            <p className="text-lg font-bold text-white">{winBannerText}</p>
            <p className="text-sm text-emerald-300 mt-1">Tap below to claim your reward</p>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="relative w-48 h-48 mx-auto">
        <motion.div
          className="w-full h-full rounded-full border-4 border-orange-500/50"
          animate={{ rotate: rotation }}
          transition={{ duration: 3, ease: [0.2, 0.8, 0.2, 1] }}
          style={{
            background: `conic-gradient(${segments.map((_, i) => {
              const colors = ["#f97316", "#ec4899", "#8b5cf6", "#06b6d4"];
              const start = (i / segments.length) * 360;
              const end = ((i + 1) / segments.length) * 360;
              return `${colors[i]} ${start}deg ${end}deg`;
            }).join(", ")})`,
          }}
        />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-0 h-0 border-l-[10px] border-r-[10px] border-t-[16px] border-l-transparent border-r-transparent border-t-white z-10" />
      </div>
      <Button
        onClick={() => {
          if (status?.spun && status.won && wonPrize && !status.claimed) {
            setShowClaim(true);
            return;
          }
          void spin();
        }}
        disabled={spinDisabled}
        size="lg"
      >
        {buttonLabel}
      </Button>

      <AnimatePresence>
        {status?.lost && (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-sm text-zinc-400"
          >
            Spin again on your next qualifying order.
          </motion.p>
        )}
      </AnimatePresence>

      <p className="text-[10px] text-zinc-500 leading-relaxed px-2">* {REWARD_DISCLAIMER}</p>

      {showClaim && wonPrize && (
        <RewardClaimModal
          prize={wonPrize.label}
          rewardType={wonPrize.type}
          tableToken={tableToken}
          lastOrder={lastOrder}
          customerName={customerName}
          onClose={() => {
            setShowClaim(false);
            setWinReveal(null);
            loadStatus();
          }}
          onClaimed={() => {
            setStatus((s) => (s ? { ...s, claimed: true, won: true } : s));
          }}
        />
      )}
    </div>
  );
}

function TriviaGame() {
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const q = TRIVIA[idx % TRIVIA.length];

  const pick = (i: number) => {
    if (selected !== null) return;
    setSelected(i);
    if (i === q.answer) setScore((s) => s + 1);
    setTimeout(() => {
      setIdx((p) => p + 1);
      setSelected(null);
    }, 1200);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-400">Score: {score}</p>
      <p className="font-medium">{q.q}</p>
      <div className="grid grid-cols-2 gap-2">
        {q.options.map((opt, i) => (
          <button
            key={opt}
            type="button"
            onClick={() => pick(i)}
            disabled={selected !== null}
            className="p-3 rounded-xl bg-white/5 border border-white/10 text-sm"
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function JokeBox() {
  const [joke, setJoke] = useState(JOKES[0]);
  return (
    <div className="text-center space-y-4">
      <p className="text-zinc-300">{joke}</p>
      <Button variant="secondary" onClick={() => setJoke(JOKES[Math.floor(Math.random() * JOKES.length)])}>
        😂 Another One!
      </Button>
    </div>
  );
}

const GAMES = [
  { id: "wheel", name: "Spin Wheel", icon: "🎡" },
  { id: "trivia", name: "Trivia", icon: "🧠" },
  { id: "jokes", name: "Jokes", icon: "😂" },
];

export function WaitingGames({
  tableToken,
  customerName,
  lastOrder,
  rewardSettings,
}: {
  tableToken: string;
  customerName: string;
  lastOrder: LastOrder | null;
  rewardSettings: RewardSettings;
}) {
  const [active, setActive] = useState("wheel");

  return (
    <Card className="p-5" glow>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">🎮</span>
        <div>
          <h3 className="font-bold text-white">While You Wait...</h3>
          <p className="text-xs text-zinc-400">Play a game while your order is prepared</p>
        </div>
      </div>
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {GAMES.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setActive(g.id)}
            className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-medium border ${
              active === g.id
                ? "bg-orange-500/20 border-orange-500/50 text-orange-300"
                : "bg-white/5 border-white/10 text-zinc-400"
            }`}
          >
            {g.icon} {g.name}
          </button>
        ))}
      </div>
      {active === "wheel" && lastOrder && (
        <SpinWheel
          key={lastOrder.id}
          lastOrder={lastOrder}
          settings={rewardSettings}
          tableToken={tableToken}
          customerName={customerName}
        />
      )}
      {active === "wheel" && !lastOrder && (
        <p className="text-sm text-zinc-500 text-center py-6">Place an order to spin for rewards.</p>
      )}
      {active === "trivia" && <TriviaGame />}
      {active === "jokes" && <JokeBox />}
    </Card>
  );
}

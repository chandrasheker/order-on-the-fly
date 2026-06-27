"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, Button, Input } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";

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
}: {
  prize: string;
  rewardType: "TEA" | "BEVERAGE";
  tableToken: string;
  lastOrder: LastOrder;
  customerName: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(customerName);
  const [saving, setSaving] = useState(false);
  const [reward, setReward] = useState<{
    code: string;
    validDate: string;
    rewardLabel: string;
  } | null>(null);

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
            <p className="text-3xl mb-2">🎉</p>
            <h3 className="text-xl font-bold text-orange-300 mb-1">You won!</h3>
            <p className="text-lg font-medium mb-4">{prize}</p>
            <p className="text-sm text-zinc-400 mb-4">
              Valid on your <strong className="text-white">next visit</strong>. Enter your name so staff can verify.
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
              <p className="text-sm"><span className="text-zinc-500">Valid on:</span> {reward.validDate}</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-sm mb-4">
              📸 <strong>Take a screenshot now!</strong> Show this to staff on your next visit.
            </div>
            <Button onClick={onClose} className="w-full">Got it!</Button>
          </>
        )}
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
  lastOrder: LastOrder | null;
  settings: RewardSettings;
  tableToken: string;
  customerName: string;
}) {
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [claimed, setClaimed] = useState(false);
  const [showClaim, setShowClaim] = useState(false);
  const [wonPrize, setWonPrize] = useState<{ label: string; type: "TEA" | "BEVERAGE" } | null>(null);

  const qualifiesBeverage = lastOrder && lastOrder.total >= settings.rewardThresholdBeverage;
  const qualifiesTea =
    lastOrder &&
    lastOrder.total >= settings.rewardThresholdTea &&
    !qualifiesBeverage;

  const canSpinReward = (qualifiesBeverage || qualifiesTea) && !claimed;

  const segments = canSpinReward
    ? qualifiesBeverage
      ? ["🥤 Beverage!", "🎉 Lucky!", "☕ Bonus", "🎁 Prize"]
      : ["☕ Free Tea!", "🎉 Lucky!", "🍀 Bonus", "🎁 Prize"]
    : ["High Five ✋", "Lucky Day 🍀", "Nice! 😊", "Fun! 🎉"];

  const spin = () => {
    if (spinning) return;
    setSpinning(true);

    let prizeIdx = Math.floor(Math.random() * segments.length);
    if (canSpinReward) {
      prizeIdx = 0;
    }

    const newRot = rotation + 1440 + (360 - prizeIdx * (360 / segments.length));
    setRotation(newRot);

    setTimeout(() => {
      setSpinning(false);
      if (canSpinReward && prizeIdx === 0) {
        const type = qualifiesBeverage ? "BEVERAGE" : "TEA";
        const label = qualifiesBeverage
          ? settings.rewardBeverageLabel
          : settings.rewardTeaLabel;
        setWonPrize({ label, type });
        setShowClaim(true);
        setClaimed(true);
      }
    }, 3000);
  };

  return (
    <div className="text-center space-y-4">
      {lastOrder && (
        <p className="text-sm text-zinc-400">
          Order #{lastOrder.orderNumber} · {formatCurrency(lastOrder.total)}
          {qualifiesBeverage && (
            <span className="block text-emerald-400 mt-1">🎁 You unlocked a spin reward!</span>
          )}
          {qualifiesTea && (
            <span className="block text-emerald-400 mt-1">☕ You unlocked a tea reward spin!</span>
          )}
        </p>
      )}
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
      <Button onClick={spin} disabled={spinning || (claimed && !!canSpinReward)} size="lg">
        {spinning ? "Spinning..." : claimed && canSpinReward ? "Reward claimed ✓" : "🎡 Spin the Wheel!"}
      </Button>

      {showClaim && wonPrize && lastOrder && (
        <RewardClaimModal
          prize={wonPrize.label}
          rewardType={wonPrize.type}
          tableToken={tableToken}
          lastOrder={lastOrder}
          customerName={customerName}
          onClose={() => setShowClaim(false)}
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
          <p className="text-xs text-zinc-400">Play a game — big orders win real rewards!</p>
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
      {active === "wheel" && (
        <SpinWheel
          lastOrder={lastOrder}
          settings={rewardSettings}
          tableToken={tableToken}
          customerName={customerName}
        />
      )}
      {active === "trivia" && <TriviaGame />}
      {active === "jokes" && <JokeBox />}
    </Card>
  );
}

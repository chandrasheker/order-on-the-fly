"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, Button } from "@/components/ui";

const TRIVIA = [
  { q: "Which country invented pizza?", options: ["Italy", "USA", "France", "Greece"], answer: 0 },
  { q: "What spice makes curry yellow?", options: ["Paprika", "Turmeric", "Cumin", "Saffron"], answer: 1 },
  { q: "Biryani originated in?", options: ["Punjab", "Hyderabad", "Persia", "Delhi"], answer: 2 },
  { q: "Dosa is made from?", options: ["Wheat", "Rice & Lentils", "Corn", "Barley"], answer: 1 },
  { q: "Which is NOT a tea type?", options: ["Oolong", "Matcha", "Espresso", "Chai"], answer: 2 },
];

const JOKES = [
  "Why did the tomato turn red? Because it saw the salad dressing! 🍅",
  "What do you call a fake noodle? An impasta! 🍝",
  "Why don't eggs tell jokes? They'd crack each other up! 🥚",
  "What did the sushi say to the bee? Wasabi! 🍣",
  "Why did the cookie go to the doctor? It felt crummy! 🍪",
  "What's a chef's favorite music? Wrap music! 🎵",
];

function SpinWheel() {
  const prizes = ["Free Chai ☕", "10% Off 🎉", "Extra Samosa 🥟", "High Five ✋", "Lucky Day 🍀", "Mystery! 🎁"];
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);

  const spin = () => {
    if (spinning) return;
    setSpinning(true);
    setResult(null);
    const idx = Math.floor(Math.random() * prizes.length);
    const newRot = rotation + 1440 + (360 - idx * (360 / prizes.length));
    setRotation(newRot);
    setTimeout(() => {
      setResult(prizes[idx]);
      setSpinning(false);
    }, 3000);
  };

  return (
    <div className="text-center space-y-4">
      <div className="relative w-48 h-48 mx-auto">
        <motion.div
          className="w-full h-full rounded-full border-4 border-orange-500/50 overflow-hidden"
          animate={{ rotate: rotation }}
          transition={{ duration: 3, ease: [0.2, 0.8, 0.2, 1] }}
          style={{
            background: `conic-gradient(${prizes.map((_, i) => {
              const colors = ["#f97316", "#ec4899", "#8b5cf6", "#06b6d4", "#10b981", "#eab308"];
              const start = (i / prizes.length) * 360;
              const end = ((i + 1) / prizes.length) * 360;
              return `${colors[i]} ${start}deg ${end}deg`;
            }).join(", ")})`,
          }}
        />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-0 h-0 border-l-[10px] border-r-[10px] border-t-[16px] border-l-transparent border-r-transparent border-t-white z-10" />
      </div>
      <Button onClick={spin} disabled={spinning} size="lg">
        {spinning ? "Spinning..." : "🎡 Spin the Wheel!"}
      </Button>
      <AnimatePresence>
        {result && (
          <motion.p
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-lg font-bold text-orange-400"
          >
            You won: {result}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function TriviaGame() {
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);

  const q = TRIVIA[idx % TRIVIA.length];

  const pick = (i: number) => {
    if (selected !== null) return;
    setSelected(i);
    setShowResult(true);
    if (i === q.answer) setScore((s) => s + 1);
    setTimeout(() => {
      setIdx((p) => p + 1);
      setSelected(null);
      setShowResult(false);
    }, 1500);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between text-sm text-zinc-400">
        <span>Score: {score}</span>
        <span>Question {(idx % TRIVIA.length) + 1}/{TRIVIA.length}</span>
      </div>
      <p className="text-lg font-medium text-white">{q.q}</p>
      <div className="grid grid-cols-2 gap-2">
        {q.options.map((opt, i) => (
          <button
            key={opt}
            onClick={() => pick(i)}
            disabled={selected !== null}
            className={`p-3 rounded-xl text-sm font-medium transition-all border ${
              showResult
                ? i === q.answer
                  ? "bg-emerald-500/30 border-emerald-500 text-emerald-300"
                  : i === selected
                  ? "bg-red-500/30 border-red-500 text-red-300"
                  : "bg-white/5 border-white/10 text-zinc-500"
                : "bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-orange-500/50"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function MemoryGame() {
  const emojis = ["🍕", "🍔", "🍟", "🌮", "🍩", "🍦", "🍜", "🥗"];
  const [cards, setCards] = useState<{ id: number; emoji: string; flipped: boolean; matched: boolean }[]>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);

  const init = useCallback(() => {
    const deck = [...emojis, ...emojis]
      .sort(() => Math.random() - 0.5)
      .map((emoji, id) => ({ id, emoji, flipped: false, matched: false }));
    setCards(deck);
    setFlipped([]);
    setMoves(0);
  }, []);

  useEffect(() => { init(); }, [init]);

  const flip = (id: number) => {
    if (flipped.length >= 2 || cards[id].flipped || cards[id].matched) return;
    const newCards = cards.map((c) => (c.id === id ? { ...c, flipped: true } : c));
    const newFlipped = [...flipped, id];
    setCards(newCards);
    setFlipped(newFlipped);

    if (newFlipped.length === 2) {
      setMoves((m) => m + 1);
      const [a, b] = newFlipped;
      if (newCards[a].emoji === newCards[b].emoji) {
        setTimeout(() => {
          setCards((prev) =>
            prev.map((c) =>
              c.id === a || c.id === b ? { ...c, matched: true } : c
            )
          );
          setFlipped([]);
        }, 400);
      } else {
        setTimeout(() => {
          setCards((prev) =>
            prev.map((c) =>
              c.id === a || c.id === b ? { ...c, flipped: false } : c
            )
          );
          setFlipped([]);
        }, 800);
      }
    }
  };

  const matched = cards.filter((c) => c.matched).length;

  return (
    <div className="space-y-3">
      <div className="flex justify-between text-sm text-zinc-400">
        <span>Moves: {moves}</span>
        <span>Matched: {matched / 2}/{emojis.length}</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {cards.map((card) => (
          <button
            key={card.id}
            onClick={() => flip(card.id)}
            className={`aspect-square rounded-xl text-2xl flex items-center justify-center transition-all duration-300 border ${
              card.flipped || card.matched
                ? "bg-orange-500/20 border-orange-500/50 scale-100"
                : "bg-white/5 border-white/10 hover:border-orange-500/30"
            }`}
          >
            {card.flipped || card.matched ? card.emoji : "?"}
          </button>
        ))}
      </div>
      {matched === emojis.length * 2 && (
        <p className="text-center text-emerald-400 font-bold">🎉 Perfect! You win!</p>
      )}
      <Button variant="secondary" size="sm" onClick={init} className="w-full">
        New Game
      </Button>
    </div>
  );
}

function JokeBox() {
  const [joke, setJoke] = useState(JOKES[0]);

  const nextJoke = () => {
    setJoke(JOKES[Math.floor(Math.random() * JOKES.length)]);
  };

  return (
    <div className="text-center space-y-4">
      <motion.p
        key={joke}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-lg text-zinc-300 leading-relaxed"
      >
        {joke}
      </motion.p>
      <Button variant="secondary" onClick={nextJoke}>
        😂 Another One!
      </Button>
    </div>
  );
}

const GAMES = [
  { id: "wheel", name: "Spin Wheel", icon: "🎡", component: SpinWheel },
  { id: "trivia", name: "Food Trivia", icon: "🧠", component: TriviaGame },
  { id: "memory", name: "Memory Match", icon: "🃏", component: MemoryGame },
  { id: "jokes", name: "Food Jokes", icon: "😂", component: JokeBox },
];

export function WaitingGames() {
  const [active, setActive] = useState("wheel");
  const ActiveGame = GAMES.find((g) => g.id === active)?.component || SpinWheel;

  return (
    <Card className="p-5" glow>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">🎮</span>
        <div>
          <h3 className="font-bold text-white">While You Wait...</h3>
          <p className="text-xs text-zinc-400">Play a mini game! Time flies when you&apos;re having fun</p>
        </div>
      </div>
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {GAMES.map((g) => (
          <button
            key={g.id}
            onClick={() => setActive(g.id)}
            className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-medium transition-all border ${
              active === g.id
                ? "bg-orange-500/20 border-orange-500/50 text-orange-300"
                : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
            }`}
          >
            {g.icon} {g.name}
          </button>
        ))}
      </div>
      <ActiveGame />
    </Card>
  );
}

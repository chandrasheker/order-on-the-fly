"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Pause, Play } from "lucide-react";

export type OofStoryVideo = {
  mp4?: string;
  webm?: string;
  poster?: string;
};

const SCENES = [
  {
    id: "crowd",
    title: "The room is full",
    copy: "Tables occupied. Energy high. This is the night you wanted — and the night the process usually breaks.",
  },
  {
    id: "wait",
    title: "A guest is trying to order",
    copy: "They look around. Raise a hand. Wait. The menu is on the table; the waiter is on the other side of the room.",
  },
  {
    id: "rush",
    title: "Staff are already carrying the rush",
    copy: "Taking orders, running food, answering ‘where is my bill?’. The bottleneck is attention, not intent.",
  },
  {
    id: "scan",
    title: "The guest scans the table QR",
    copy: "No app install theatre. The table is the entry point. The live menu opens on their phone.",
  },
  {
    id: "menu",
    title: "They order from the live menu",
    copy: "What is available is what they see. A second item later does not require catching someone again.",
  },
  {
    id: "kitchen",
    title: "The ticket is already in the workflow",
    copy: "Kitchen and service see the same order. No rewritten pad. No ‘what table was that?’",
  },
  {
    id: "ready",
    title: "Ready, paid, collected",
    copy: "When food is ready, payment can be required before handover. Outstanding balance blocks collection.",
  },
  {
    id: "done",
    title: "The guest is eating. The floor is clearer.",
    copy: "Hospitality is still yours. The waiting-for-permission loop is not.",
  },
];

function Storyboard({ reduce }: { reduce: boolean | null }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const autoplay = playing && !reduce;

  useEffect(() => {
    if (!autoplay) return undefined;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % SCENES.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [autoplay]);

  const scene = SCENES[index] ?? SCENES[0];

  return (
    <div className="overflow-hidden rounded-3xl border border-orange-400/20 bg-gradient-to-b from-[#2a160c] to-[#120904]">
      <div className="relative aspect-[16/10] sm:aspect-[16/8]">
        <AnimatePresence mode="wait">
          <motion.div
            key={scene.id}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.45 }}
            className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10"
          >
            <SceneArt id={scene.id} />
            <p className="relative text-xs uppercase tracking-[0.2em] text-orange-200/80">
              Scene {String(index + 1).padStart(2, "0")}
            </p>
            <h3 className="relative mt-2 text-2xl font-semibold text-white sm:text-3xl">{scene.title}</h3>
            <p className="relative mt-2 max-w-2xl text-sm leading-relaxed text-orange-50/75 sm:text-base">
              {scene.copy}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-white/10 px-4 py-3 sm:px-6">
        {reduce ? (
          <p className="text-xs text-orange-50/70">Select a scene</p>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs text-white"
            onClick={() => setPlaying((value) => !value)}
            aria-pressed={autoplay}
          >
            {autoplay ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            {autoplay ? "Pause" : "Play"}
          </button>
        )}
        <div className="flex min-w-0 flex-1 gap-1" role="tablist" aria-label="Story scenes">
          {SCENES.map((item, sceneIndex) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={sceneIndex === index}
              className={`h-1.5 flex-1 rounded-full ${sceneIndex === index ? "bg-orange-400" : "bg-white/15"}`}
              onClick={() => {
                setIndex(sceneIndex);
                setPlaying(false);
              }}
            >
              <span className="sr-only">{item.title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SceneArt({ id }: { id: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(251,146,60,0.18),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(244,63,94,0.12),transparent_40%)]" />
      {id === "crowd" ? (
        <div className="absolute inset-x-8 bottom-28 flex justify-between opacity-70">
          {Array.from({ length: 7 }).map((_, i) => (
            <span key={i} className="h-16 w-10 rounded-t-full bg-orange-200/15" />
          ))}
        </div>
      ) : null}
      {id === "wait" ? <div className="absolute left-10 top-12 h-24 w-24 rounded-full border border-dashed border-orange-200/40" /> : null}
      {id === "rush" ? (
        <div className="absolute right-10 top-10 grid grid-cols-3 gap-2 opacity-60">
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="h-8 w-12 rounded bg-white/10" />
          ))}
        </div>
      ) : null}
      {id === "scan" ? <div className="absolute right-16 top-14 h-28 w-28 rounded-xl border-2 border-orange-300/50" /> : null}
      {id === "menu" ? <div className="absolute left-1/2 top-10 h-40 w-24 -translate-x-1/2 rounded-[1.5rem] border border-white/20 bg-black/30" /> : null}
      {id === "kitchen" ? <div className="absolute inset-x-16 top-12 h-20 rounded-xl bg-orange-400/10 border border-orange-200/20" /> : null}
      {id === "ready" ? <div className="absolute right-12 top-12 size-16 rounded-full bg-emerald-400/30" /> : null}
      {id === "done" ? <div className="absolute inset-x-0 top-8 h-24 bg-gradient-to-b from-orange-200/10 to-transparent" /> : null}
    </div>
  );
}

export function OofProductStory({ video }: { video?: OofStoryVideo }) {
  const reduce = useReducedMotion();
  const hasVideo = Boolean(video?.mp4 || video?.webm);

  if (hasVideo) {
    return (
      <div className="overflow-hidden rounded-3xl border border-orange-400/20 bg-black">
        <video className="w-full h-auto" controls playsInline poster={video?.poster} preload="metadata">
          {video?.webm ? <source src={video.webm} type="video/webm" /> : null}
          {video?.mp4 ? <source src={video.mp4} type="video/mp4" /> : null}
        </video>
      </div>
    );
  }

  return <Storyboard reduce={reduce} />;
}

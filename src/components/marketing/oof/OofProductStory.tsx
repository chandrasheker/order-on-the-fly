"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
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
    image: "/marketing/oof/story/01-crowd.jpg",
    alt: "A full dining room at night, every table occupied under warm lights.",
  },
  {
    id: "wait",
    title: "A guest is trying to order",
    copy: "They look around. Raise a hand. Wait. The menu is on the table; the waiter is on the other side of the room.",
    image: "/marketing/oof/story/02-wait.jpg",
    alt: "A guest at a table raising a hand while a waiter is busy elsewhere.",
  },
  {
    id: "rush",
    title: "Staff are already carrying the rush",
    copy: "Taking orders, running food, answering ‘where is my bill?’. The bottleneck is attention, not intent.",
    image: "/marketing/oof/story/03-rush.jpg",
    alt: "A waiter carrying plates through a busy kitchen pass while another staff member writes an order.",
  },
  {
    id: "scan",
    title: "The guest scans the table QR",
    copy: "No app install theatre. The table is the entry point. The live menu opens on their phone.",
    image: "/marketing/oof/story/04-scan.jpg",
    alt: "Hands holding a phone so the camera frames a QR code on a table tent.",
  },
  {
    id: "menu",
    title: "They order from the live menu",
    copy: "What is available is what they see. A second item later does not require catching someone again.",
    image: "/marketing/oof/story/05-menu.jpg",
    alt: "A guest ordering from a phone menu at the table.",
  },
  {
    id: "kitchen",
    title: "The ticket is already in the workflow",
    copy: "Kitchen and service see the same order. No rewritten pad. No ‘what table was that?’",
    image: "/marketing/oof/story/06-kitchen.jpg",
    alt: "Chefs plating food at the pass while a kitchen screen sits out of focus.",
  },
  {
    id: "ready",
    title: "Ready, paid, collected",
    copy: "When food is ready, payment can be required before handover. Outstanding balance blocks collection.",
    image: "/marketing/oof/story/07-ready.jpg",
    alt: "Staff handing over a plated order as the guest shows a payment confirmation on their phone.",
  },
  {
    id: "done",
    title: "The guest is eating. The floor is clearer.",
    copy: "Hospitality is still yours. The waiting-for-permission loop is not.",
    image: "/marketing/oof/story/08-done.jpg",
    alt: "Guests eating together while a waiter walks a calmer dining room.",
  },
] as const;

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
            <Image
              src={scene.image}
              alt={scene.alt}
              fill
              priority={index === 0}
              sizes="(max-width: 768px) 100vw, 1152px"
              className="object-cover"
            />
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/15"
              aria-hidden
            />
            <p className="relative text-xs uppercase tracking-[0.2em] text-orange-200/80">
              Scene {String(index + 1).padStart(2, "0")}
            </p>
            <h3 className="relative mt-2 text-2xl font-semibold text-white sm:text-3xl">{scene.title}</h3>
            <p className="relative mt-2 max-w-2xl text-sm leading-relaxed text-orange-50/90 sm:text-base">
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

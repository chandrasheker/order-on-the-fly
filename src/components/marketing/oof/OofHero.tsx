"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export function OofHero() {
  const reduce = useReducedMotion();

  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -top-16 right-0 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="absolute bottom-0 left-10 h-80 w-80 rounded-full bg-amber-600/10 blur-3xl" />
      </div>
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-orange-300/90">Order-on-the-Fly · TableTap by DVADTech</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
            Your restaurant may be full. Your customers shouldn&apos;t be waiting.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-orange-50/70">
            Guests scan, see a live menu, and order. The kitchen sees the ticket. Payment and collection
            stay under your control. Hospitality stays. The hunting-for-a-waiter loop does not.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <a
              href="#story"
              className="inline-flex items-center justify-center rounded-full bg-orange-500 px-5 py-2.5 text-sm font-medium text-zinc-950"
            >
              See How It Works
            </a>
            <a
              href="#pilot"
              className="inline-flex items-center justify-center rounded-full border border-orange-200/30 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/5"
            >
              Start a Pilot
            </a>
            <a
              href="#pilot"
              className="inline-flex items-center justify-center rounded-full border border-white/10 px-5 py-2.5 text-sm font-medium text-orange-50/80 hover:text-white"
            >
              Book a Live Demo
            </a>
            <Link
              href="/oof/platform/login"
              className="inline-flex items-center justify-center text-sm font-medium text-orange-200 hover:text-white"
            >
              Platform Login
              <ArrowRight className="ml-1 size-4" />
            </Link>
          </div>
        </div>
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.7 }}
          className="relative"
        >
          <div className="rounded-3xl border border-orange-400/25 bg-black/40 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
            <p className="text-xs uppercase tracking-[0.16em] text-orange-300/80">On the floor</p>
            <ol className="mt-4 space-y-3 text-sm">
              {[
                "Guest sits and scans the table QR",
                "Live menu — no hunting for a waiter",
                "Kitchen sees the order immediately",
                "Ready → pay when your service model requires it",
                "Collect or serve with a clear table state",
              ].map((line, index) => (
                <li key={line} className="flex gap-3 text-orange-50/85">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-orange-500/20 text-xs text-orange-200">
                    {index + 1}
                  </span>
                  {line}
                </li>
              ))}
            </ol>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

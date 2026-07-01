"use client";

import { ThemeToggle } from "@/components/ThemeToggle";

/** Fixed top-right theme control — headers with `data-header-actions` reserve space via CSS. */
export function FixedThemeToggle() {
  return (
    <div
      className="fixed top-3 right-3 z-[70] pointer-events-none sm:top-4 sm:right-4"
      aria-hidden={false}
    >
      <div className="pointer-events-auto">
        <ThemeToggle className="shadow-lg backdrop-blur-md bg-[color:var(--surface)]/95" />
      </div>
    </div>
  );
}

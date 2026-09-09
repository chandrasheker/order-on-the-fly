"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { RestaurantServiceMode } from "@/lib/fulfillment/constants";
import { swallowPollingFetchError } from "@/lib/client-fetch";

const BUTTONS: { id: RestaurantServiceMode; label: string; short: string }[] = [
  { id: "FULL_SERVICE", label: "FULL SERVICE", short: "FULL" },
  { id: "SELF_SERVICE", label: "SELF SERVICE", short: "SELF" },
  { id: "HYBRID", label: "HYBRID", short: "HYBRID" },
];

function nextServiceMode(
  current: RestaurantServiceMode,
  clicked: RestaurantServiceMode,
): RestaurantServiceMode {
  if (clicked === "HYBRID") {
    return current === "HYBRID" ? "FULL_SERVICE" : "HYBRID";
  }
  if (clicked === "FULL_SERVICE") {
    return current === "FULL_SERVICE" ? "SELF_SERVICE" : "FULL_SERVICE";
  }
  return current === "SELF_SERVICE" ? "FULL_SERVICE" : "SELF_SERVICE";
}

function isLit(mode: RestaurantServiceMode, id: RestaurantServiceMode) {
  if (mode === "HYBRID") return true;
  return mode === id;
}

export function ServiceModeToggle() {
  const [mode, setMode] = useState<RestaurantServiceMode>("FULL_SERVICE");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/restaurant/service-mode");
      if (!res.ok) return;
      const json = await res.json();
      if (json?.settings?.serviceMode) {
        setMode(json.settings.serviceMode);
      }
    } catch (error) {
      swallowPollingFetchError(error);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = async (clicked: RestaurantServiceMode) => {
    const next = nextServiceMode(mode, clicked);
    if (next === mode || saving) return;
    const previous = mode;
    setMode(next);
    setSaving(true);
    try {
      const res = await fetch("/api/restaurant/service-mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceMode: next }),
      });
      if (!res.ok) {
        setMode(previous);
        return;
      }
      const json = await res.json().catch(() => null);
      if (json?.settings?.serviceMode) {
        setMode(json.settings.serviceMode);
      }
    } catch (error) {
      setMode(previous);
      swallowPollingFetchError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-sm font-semibold text-foreground">Service model</p>
        <p className="text-xs text-muted">One-click · at least one on</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {BUTTONS.map(({ id, label, short }) => {
          const on = isLit(mode, id);
          return (
            <button
              key={id}
              type="button"
              disabled={saving}
              onClick={() => void apply(id)}
              aria-pressed={on}
              className={cn(
                "px-1.5 py-2 rounded-xl border text-[10px] sm:text-xs font-semibold tracking-wide transition-colors disabled:opacity-60",
                on
                  ? id === "HYBRID"
                    ? "bg-violet-500/20 border-violet-500/40 text-violet-900 dark:text-violet-100"
                    : id === "SELF_SERVICE"
                      ? "bg-sky-500/20 border-sky-500/40 text-sky-900 dark:text-sky-100"
                      : "bg-orange-500/20 border-orange-500/40 text-orange-900 dark:text-orange-100"
                  : "bg-white/5 border-white/10 text-muted hover:text-foreground",
              )}
            >
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

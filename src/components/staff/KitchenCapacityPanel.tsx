"use client";

import { useEffect, useState, useCallback } from "react";
import { Pause, Play, ChefHat, ChevronDown, ChevronUp } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import { swallowPollingFetchError } from "@/lib/client-fetch";

interface KitchenState {
  paused: boolean;
  message: string | null;
  autoPauseThreshold?: number;
  overdueCount?: number;
}

export function KitchenCapacityPanel({ enabled }: { enabled: boolean }) {
  const [state, setState] = useState<KitchenState | null>(null);
  const [message, setMessage] = useState("");
  const [threshold, setThreshold] = useState(0);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch("/api/realtime/kitchen");
      if (res.ok) {
        const json = await res.json();
        setState(json.state);
        setMessage(json.state.message ?? "");
        setThreshold(json.state.autoPauseThreshold ?? 0);
      }
    } catch {
      /* ignore transient network errors during dev reload or polling */
    }
  }, [enabled]);

  useEffect(() => {
    void load();
    if (!enabled) return;
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [enabled, load]);

  const save = async (paused: boolean) => {
    setSaving(true);
    try {
      const res = await fetch("/api/realtime/kitchen", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paused,
          message: message.trim() || null,
          autoPauseOverdueThreshold: threshold,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setState(json.state);
      }
    } catch (error) {
      swallowPollingFetchError(error);
    } finally {
      setSaving(false);
    }
  };

  if (!enabled || !state) return null;

  const paused = state.paused;

  return (
    <div
      className={cn(
        "h-full p-4 rounded-2xl border",
        paused ? "border-amber-500/40 bg-amber-500/10" : "border-white/10 bg-white/5",
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <ChefHat className={cn("w-5 h-5 shrink-0", paused ? "text-amber-300" : "text-zinc-400")} />
          <div className="min-w-0">
            <p className="font-semibold text-white">Kitchen load control</p>
            <p className="text-xs text-zinc-400">
              {paused ? "QR orders paused" : "Accepting orders"}
              {state.overdueCount != null && ` · ${state.overdueCount} overdue`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 shrink-0"
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>

      {expanded && (
        <>
      <div className="grid grid-cols-1 gap-3 mb-3">
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Pause message (guests see this)</label>
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Kitchen is catching up — back in 10 min"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Auto-pause when overdue items ≥</label>
          <Input
            type="number"
            min={0}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="flex gap-2">
        {paused ? (
          <Button disabled={saving} onClick={() => void save(false)} className="gap-1.5">
            <Play className="w-4 h-4" />
            Resume orders
          </Button>
        ) : (
          <Button
            variant="secondary"
            disabled={saving}
            onClick={() => void save(true)}
            className="gap-1.5 border-amber-500/30 text-amber-300"
          >
            <Pause className="w-4 h-4" />
            Pause QR orders
          </Button>
        )}
      </div>
        </>
      )}
    </div>
  );
}

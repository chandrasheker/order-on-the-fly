"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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

export function KitchenCapacityPanel({
  enabled,
  compact = false,
}: {
  enabled: boolean;
  compact?: boolean;
}) {
  const [state, setState] = useState<KitchenState | null>(null);
  const [message, setMessage] = useState("");
  const [threshold, setThreshold] = useState(0);
  const [expanded, setExpanded] = useState(!compact);
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    if (!enabled || savingRef.current) return;
    try {
      const res = await fetch("/api/realtime/kitchen");
      if (res.ok) {
        const json = await res.json();
        if (savingRef.current) return;
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
    if (!state || savingRef.current) return;
    const previous = state;
    savingRef.current = true;
    setState({ ...state, paused });
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
        setMessage(json.state.message ?? message);
        setThreshold(json.state.autoPauseThreshold ?? threshold);
      } else {
        setState(previous);
      }
    } catch (error) {
      setState(previous);
      swallowPollingFetchError(error);
    } finally {
      savingRef.current = false;
    }
  };

  if (!enabled || !state) return null;

  const paused = state.paused;

  return (
    <div
      className={cn(
        "rounded-2xl border",
        compact ? "p-3" : "h-full p-4",
        paused ? "border-amber-500/40 bg-amber-500/10" : "border-white/10 bg-white/5",
      )}
    >
      <div className={cn("flex items-start justify-between gap-2", compact ? "mb-2" : "mb-3")}>
        <div className="flex items-center gap-2 min-w-0">
          <ChefHat className={cn("shrink-0", compact ? "w-4 h-4" : "w-5 h-5", paused ? "text-amber-800 dark:text-amber-300" : "text-muted")} />
          <div className="min-w-0">
            <p className={cn("font-semibold text-foreground", compact && "text-sm")}>
              {compact ? "Kitchen load" : "Kitchen load control"}
            </p>
            <p className="text-xs text-muted">
              {paused ? "QR orders paused" : "Accepting orders"}
              {state.overdueCount != null && ` · ${state.overdueCount} overdue`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border border-white/10 bg-white/5 text-muted hover:text-foreground hover:bg-white/10 shrink-0"
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {compact ? null : expanded ? "Collapse" : "Expand"}
        </button>
      </div>
      {compact && !expanded && (
        <div className="mt-2">
          {paused ? (
            <Button size="sm" onClick={() => void save(false)} className="w-full gap-1.5">
              <Play className="w-3.5 h-3.5" />
              Resume
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void save(true)}
              className="w-full gap-1.5 border-amber-500/30 text-amber-800 dark:text-amber-300"
            >
              <Pause className="w-3.5 h-3.5" />
              Pause QR
            </Button>
          )}
        </div>
      )}

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
          <Button onClick={() => void save(false)} className="gap-1.5">
            <Play className="w-4 h-4" />
            Resume orders
          </Button>
        ) : (
          <Button
            variant="secondary"
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

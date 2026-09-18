"use client";

import { useCallback, useEffect, useRef } from "react";
import { isClientOffline, swallowPollingFetchError } from "@/lib/client-fetch";

/** Fast live refresh: skip overlapping polls (never abort in-flight) and bump immediately on SSE. */
export function useLiveRefresh(
  load: () => Promise<void> | void,
  options?: {
    enabled?: boolean;
    intervalMs?: number;
    streamUrl?: string | null;
  },
) {
  const enabled = options?.enabled ?? true;
  const intervalMs = options?.intervalMs ?? 2000;
  const streamUrl = options?.streamUrl ?? null;
  const inFlightRef = useRef(false);
  const loadRef = useRef(load);
  loadRef.current = load;

  const tick = useCallback(async () => {
    if (!enabled) return;
    if (typeof document !== "undefined" && document.hidden) return;
    if (isClientOffline()) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      await loadRef.current();
    } catch (error) {
      swallowPollingFetchError(error);
    } finally {
      inFlightRef.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void tick();
    const interval = setInterval(() => void tick(), intervalMs);
    const onVisible = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [enabled, intervalMs, tick]);

  useEffect(() => {
    if (!enabled || !streamUrl || typeof EventSource === "undefined") return;
    const source = new EventSource(streamUrl);
    source.onmessage = () => {
      void tick();
    };
    return () => source.close();
  }, [enabled, streamUrl, tick]);
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { FLOOR_CHANGED_EVENT } from "@/lib/floor-state-styles";
import { swallowPollingFetchError } from "@/lib/client-fetch";

type FloorStateRow = {
  state: string;
};

export function useFloorTableStates() {
  const [states, setStates] = useState<Record<string, FloorStateRow>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/floor");
      if (!res.ok) return;
      const json = await res.json();
      const next: Record<string, FloorStateRow> = {};
      for (const table of json.tables ?? []) {
        if (table?.id) next[table.id] = { state: String(table.state ?? "available") };
      }
      setStates(next);
    } catch (error) {
      swallowPollingFetchError(error);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void load();
    }, 8000);
    const onChanged = () => {
      void load();
    };
    window.addEventListener(FLOOR_CHANGED_EVENT, onChanged);
    return () => {
      clearInterval(interval);
      window.removeEventListener(FLOOR_CHANGED_EVENT, onChanged);
    };
  }, [load]);

  return { states, reload: load };
}

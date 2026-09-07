"use client";

import { useEffect, useRef } from "react";

export type PickupAlertState =
  | "PREPARING"
  | "FOOD_READY_PAYMENT_REQUIRED"
  | "READY_FOR_COLLECTION"
  | "COLLECTED"
  | "CANCELLED";

function storageKey(orderId: string, state: string) {
  return `tabletap-pickup-alert:${orderId}:${state}`;
}

function playPleasantChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(740, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(980, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.42);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.45);
  } catch {
    /* autoplay may be blocked */
  }
}

export function useSelfPickupAlerts(
  orders: Array<{ id: string; pickup?: { pickupState?: PickupAlertState | null } | null }>,
) {
  const previous = useRef<Map<string, PickupAlertState | null>>(new Map());

  useEffect(() => {
    for (const order of orders) {
      const next = order.pickup?.pickupState ?? null;
      const prev = previous.current.get(order.id) ?? null;
      previous.current.set(order.id, next);
      if (!next || next === prev) continue;
      if (next !== "FOOD_READY_PAYMENT_REQUIRED" && next !== "READY_FOR_COLLECTION") continue;
      if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(storageKey(order.id, next))) {
        continue;
      }
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(storageKey(order.id, next), "1");
      }
      if (next === "READY_FOR_COLLECTION") {
        playPleasantChime();
        try {
          navigator.vibrate?.([80, 40, 80]);
        } catch {
          /* unsupported */
        }
      }
    }
  }, [orders]);
}

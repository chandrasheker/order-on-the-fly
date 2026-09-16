"use client";

import { useEffect, useRef } from "react";

export type PickupAlertState =
  | "AWAITING_PAYMENT"
  | "PREPARING"
  | "FOOD_READY_PAYMENT_REQUIRED"
  | "READY_FOR_COLLECTION"
  | "COLLECTED"
  | "CANCELLED";

function storageKey(orderId: string, state: string) {
  return `tabletap-pickup-alert:${orderId}:${state}`;
}

function playPickupAlarm(urgent: boolean) {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const pulses = urgent ? 3 : 1;
    for (let i = 0; i < pulses; i += 1) {
      const start = ctx.currentTime + i * 0.55;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = urgent ? "square" : "sine";
      oscillator.frequency.setValueAtTime(urgent ? 880 : 740, start);
      oscillator.frequency.exponentialRampToValueAtTime(urgent ? 1174 : 980, start + 0.18);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(urgent ? 0.16 : 0.08, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.45);
    }
  } catch {
    /* autoplay may be blocked until the customer enables alerts */
  }
}

function showLocalNotification(title: string, body: string, tag: string, urgent: boolean) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, {
      body,
      tag,
      requireInteraction: urgent,
    });
    window.setTimeout(() => n.close(), urgent ? 20000 : 8000);
  } catch {
    /* some browsers only allow service-worker notifications */
  }
}

export function useSelfPickupAlerts(
  orders: Array<{
    id: string;
    orderNumber?: number;
    pickup?: { pickupState?: string | null; pickupNumber?: number | null } | null;
  }>,
) {
  const previous = useRef<Map<string, PickupAlertState | null>>(new Map());

  useEffect(() => {
    for (const order of orders) {
      const next = (order.pickup?.pickupState ?? null) as PickupAlertState | null;
      const prev = previous.current.get(order.id) ?? null;
      previous.current.set(order.id, next);
      if (!next || next === prev) continue;
      if (
        next !== "FOOD_READY_PAYMENT_REQUIRED" &&
        next !== "READY_FOR_COLLECTION" &&
        next !== "COLLECTED"
      ) {
        continue;
      }
      if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(storageKey(order.id, next))) {
        continue;
      }
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(storageKey(order.id, next), "1");
      }
      const pickupNumber = order.pickup?.pickupNumber ?? order.orderNumber ?? "";
      if (next === "READY_FOR_COLLECTION") {
        playPickupAlarm(true);
        try {
          navigator.vibrate?.([120, 60, 120, 60, 240]);
        } catch {
          /* unsupported */
        }
        showLocalNotification(
          "READY FOR COLLECTION",
          `Pickup #${pickupNumber} is ready. Please collect it at the counter.`,
          `pickup-${order.id}-READY_FOR_COLLECTION`,
          true,
        );
      } else if (next === "FOOD_READY_PAYMENT_REQUIRED") {
        playPickupAlarm(true);
        try {
          navigator.vibrate?.([80, 40, 80]);
        } catch {
          /* unsupported */
        }
        showLocalNotification(
          "YOUR ORDER IS READY",
          `Pickup #${pickupNumber} is ready. Payment is required before collection.`,
          `pickup-${order.id}-FOOD_READY_PAYMENT_REQUIRED`,
          true,
        );
      } else if (next === "COLLECTED") {
        playPickupAlarm(false);
        showLocalNotification(
          "Order collected",
          `Pickup #${pickupNumber} has been collected. Thank you!`,
          `pickup-${order.id}-COLLECTED`,
          false,
        );
      }
    }
  }, [orders]);
}

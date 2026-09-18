"use client";

import { useCallback, useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function subscribeCustomerPush(params: {
  tableId: string;
  tableToken: string;
  sessionKey: string;
}) {
  const vapidRes = await fetch("/api/push/vapid");
  if (vapidRes.ok) {
    const { publicKey } = await vapidRes.json();
    if (publicKey) {
      const reg = await navigator.serviceWorker.register("/sw-push.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));
      await fetch("/api/push/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tableToken: params.tableToken,
          sessionKey: params.sessionKey,
          endpoint: sub.endpoint,
          keys: sub.toJSON().keys,
        }),
      });
    }
  }
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      if (ctx.state === "suspended") await ctx.resume();
    }
  } catch {
    /* autoplay may stay blocked */
  }
}

export function useCustomerPush(params: {
  enabled: boolean;
  tableId?: string;
  tableToken?: string;
  sessionKey?: string | null;
}) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [pushReady, setPushReady] = useState(false);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  }, []);

  const subscribeIfGranted = useCallback(async () => {
    if (!params.enabled || !params.tableId || !params.tableToken || !params.sessionKey) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return;
    }
    if (Notification.permission !== "granted") return;
    try {
      await subscribeCustomerPush({
        tableId: params.tableId,
        tableToken: params.tableToken,
        sessionKey: params.sessionKey,
      });
      setPushReady(true);
    } catch {
      /* local notification still works without a push subscription */
    }
  }, [params.enabled, params.tableId, params.tableToken, params.sessionKey]);

  useEffect(() => {
    if (permission === "granted") void subscribeIfGranted();
  }, [permission, subscribeIfGranted]);

  const enablePush = useCallback(async () => {
    if (!("Notification" in window)) return false;
    setEnabling(true);
    try {
      const next = await Notification.requestPermission();
      setPermission(next);
      if (next !== "granted") return false;
      await subscribeIfGranted();
      return true;
    } catch {
      return false;
    } finally {
      setEnabling(false);
    }
  }, [subscribeIfGranted]);

  return { permission, pushReady, enabling, enablePush };
}

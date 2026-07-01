"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

export function useStaffPush(enabled: boolean) {
  const registeredRef = useRef(false);
  const [pushReady, setPushReady] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  const registerPush = useCallback(async () => {
    if (!enabled || registeredRef.current) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushError("Push not supported in this browser");
      return;
    }

    try {
      const vapidRes = await fetch("/api/push/vapid");
      if (!vapidRes.ok) {
        setPushError("Push not configured on server");
        return;
      }
      const { publicKey } = await vapidRes.json();

      const reg = await navigator.serviceWorker.register("/sw-push.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const json = sub.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
        }),
      });

      registeredRef.current = true;
      setPushReady(true);
      setPushError(null);
    } catch (err) {
      setPushError(err instanceof Error ? err.message : "Push registration failed");
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled && Notification.permission === "granted") {
      void registerPush();
    }
  }, [enabled, registerPush]);

  return { pushReady, pushError, registerPush };
}

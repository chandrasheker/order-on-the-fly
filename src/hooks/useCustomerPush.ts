"use client";

import { useEffect } from "react";

export function useCustomerPush(params: {
  enabled: boolean;
  tableId?: string;
  tableToken?: string;
  sessionKey?: string | null;
}) {
  useEffect(() => {
    if (!params.enabled || !params.tableId || !params.tableToken || !params.sessionKey) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return;
    }
    if (Notification.permission !== "granted") return;

    let cancelled = false;
    void (async () => {
      try {
        const vapidRes = await fetch("/api/push/vapid");
        if (!vapidRes.ok) return;
        const { publicKey } = await vapidRes.json();
        if (!publicKey || cancelled) return;
        const reg = await navigator.serviceWorker.register("/sw-push.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        const sub =
          existing ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          }));
        if (cancelled) return;
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
      } catch {
        /* optional */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.enabled, params.tableId, params.tableToken, params.sessionKey]);
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

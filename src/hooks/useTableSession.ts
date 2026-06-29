import { useCallback, useEffect, useState } from "react";

const HEARTBEAT_MS = 2 * 60 * 1000;

function storageKey(tableToken: string) {
  return `tabletap-session-${tableToken}`;
}

function getOrCreateSessionKey(tableToken: string) {
  if (typeof window === "undefined") return "";
  const key = storageKey(tableToken);
  let sessionKey = sessionStorage.getItem(key);
  if (!sessionKey) {
    sessionKey = crypto.randomUUID();
    sessionStorage.setItem(key, sessionKey);
  }
  return sessionKey;
}

export interface TableSessionState {
  loading: boolean;
  active: boolean;
  canOrder: boolean;
  canTrackExistingOrder: boolean;
  orderingEnabled: boolean;
  diningVerified: boolean;
  maxSessions: number;
  activeCount: number;
  sessionKey: string;
  gateMessage: string | null;
  retry: () => void;
  checkInPath: string;
}

export function useTableSession(tableToken: string, slug: string): TableSessionState {
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(false);
  const [canOrder, setCanOrder] = useState(false);
  const [canTrackExistingOrder, setCanTrackExistingOrder] = useState(false);
  const [orderingEnabled, setOrderingEnabled] = useState(false);
  const [diningVerified, setDiningVerified] = useState(false);
  const [maxSessions, setMaxSessions] = useState(2);
  const [activeCount, setActiveCount] = useState(0);
  const [gateMessage, setGateMessage] = useState<string | null>(null);
  const [sessionKey, setSessionKey] = useState("");

  const checkInPath = `/order/${slug}/${tableToken}/check-in`;

  const refresh = useCallback(async () => {
    const key = getOrCreateSessionKey(tableToken);
    setSessionKey(key);
    setLoading(true);

    try {
      const res = await fetch(
        `/api/tables/dining-status?tableToken=${encodeURIComponent(tableToken)}&sessionKey=${encodeURIComponent(key)}`,
        { credentials: "include" },
      );
      if (res.ok) {
        const data = await res.json();
        setOrderingEnabled(Boolean(data.orderingEnabled));
        setDiningVerified(Boolean(data.diningVerified));
        setActive(Boolean(data.sessionActive));
        setCanOrder(Boolean(data.canOrder));
        setCanTrackExistingOrder(Boolean(data.canTrackExistingOrder));
        setMaxSessions(data.maxSessions ?? 2);
        setActiveCount(data.activeCount ?? 0);
        setGateMessage(data.message ?? null);
      } else {
        const data = await res.json().catch(() => ({}));
        setCanOrder(false);
        setCanTrackExistingOrder(false);
        setActive(false);
        setGateMessage(data.message || data.error || "Scan the QR code at your table to order.");
      }
    } catch {
      setCanOrder(false);
      setCanTrackExistingOrder(false);
      setActive(false);
      setGateMessage("Could not verify table access. Scan the QR code at your table.");
    } finally {
      setLoading(false);
    }
  }, [tableToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!sessionKey || !diningVerified || !active) return;

    const heartbeat = setInterval(async () => {
      try {
        await fetch("/api/tables/session", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ tableToken, sessionKey }),
        });
      } catch {
        /* ignore */
      }
    }, HEARTBEAT_MS);

    return () => {
      clearInterval(heartbeat);
    };
  }, [tableToken, sessionKey, diningVerified, active]);

  return {
    loading,
    active,
    canOrder,
    canTrackExistingOrder,
    orderingEnabled,
    diningVerified,
    maxSessions,
    activeCount,
    sessionKey,
    gateMessage,
    retry: refresh,
    checkInPath,
  };
}

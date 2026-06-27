import { useCallback, useEffect, useRef, useState } from "react";

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
  maxSessions: number;
  activeCount: number;
  sessionKey: string;
  retry: () => void;
}

export function useTableSession(tableToken: string): TableSessionState {
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(false);
  const [maxSessions, setMaxSessions] = useState(2);
  const [activeCount, setActiveCount] = useState(0);
  const [sessionKey, setSessionKey] = useState("");
  const joinedRef = useRef(false);

  const join = useCallback(async () => {
    const key = getOrCreateSessionKey(tableToken);
    setSessionKey(key);
    setLoading(true);

    try {
      const res = await fetch("/api/tables/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableToken, sessionKey: key }),
      });
      if (res.ok) {
        const data = await res.json();
        setActive(data.active);
        setMaxSessions(data.maxSessions);
        setActiveCount(data.activeCount);
        joinedRef.current = data.active;
      } else {
        setActive(false);
        joinedRef.current = false;
      }
    } catch {
      setActive(false);
      joinedRef.current = false;
    } finally {
      setLoading(false);
    }
  }, [tableToken]);

  useEffect(() => {
    join();
  }, [join]);

  useEffect(() => {
    if (!sessionKey || !active) return;

    const heartbeat = setInterval(async () => {
      try {
        await fetch("/api/tables/session", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tableToken, sessionKey }),
        });
      } catch {
        /* ignore */
      }
    }, HEARTBEAT_MS);

    const leave = () => {
      if (!joinedRef.current || !sessionKey) return;
      fetch("/api/tables/session", {
        method: "DELETE",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableToken, sessionKey }),
      }).catch(() => {});
    };

    window.addEventListener("pagehide", leave);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener("pagehide", leave);
    };
  }, [tableToken, sessionKey, active]);

  return {
    loading,
    active,
    maxSessions,
    activeCount,
    sessionKey,
    retry: join,
  };
}

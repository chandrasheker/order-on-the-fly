"use client";

import { useCallback, useEffect, useState } from "react";

const DB_NAME = "tabletap-offline";
const STORE = "pending_orders";

type PendingOrder = {
  clientId: string;
  tableId?: string;
  customerName?: string;
  items: Array<{ menuItemId: string; quantity: number; notes?: string }>;
  createdAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "clientId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function savePending(order: PendingOrder) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(order);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function listPending(): Promise<PendingOrder[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as PendingOrder[]);
    req.onerror = () => reject(req.error);
  });
}

async function removePending(clientId: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(clientId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function useOfflineOrderSync(enabled = true) {
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshCount = useCallback(async () => {
    if (!enabled || typeof indexedDB === "undefined") return;
    const rows = await listPending();
    setPendingCount(rows.length);
  }, [enabled]);

  const syncPending = useCallback(async () => {
    if (!enabled || typeof indexedDB === "undefined") return;
    setSyncing(true);
    try {
      const rows = await listPending();
      for (const row of rows) {
        const res = await fetch("/api/offline/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(row),
        });
        if (res.ok) await removePending(row.clientId);
      }
      await refreshCount();
    } finally {
      setSyncing(false);
    }
  }, [enabled, refreshCount]);

  useEffect(() => {
    if (!enabled) return;
    setOnline(navigator.onLine);
    const onOnline = () => {
      setOnline(true);
      void syncPending();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    void refreshCount();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [enabled, refreshCount, syncPending]);

  const queueOrder = useCallback(
    async (order: Omit<PendingOrder, "clientId" | "createdAt">) => {
      const clientId = crypto.randomUUID();
      await savePending({ ...order, clientId, createdAt: Date.now() });
      await refreshCount();
      return clientId;
    },
    [refreshCount],
  );

  return { online, pendingCount, syncing, queueOrder, syncPending };
}

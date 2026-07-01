"use client";

import { useCallback, useEffect, useState } from "react";

const DB_NAME = "tabletap-offline";
const DB_VERSION = 2;
const STORE_ORDERS = "pending_orders";
const STORE_MENU = "menu_cache";

export type PendingOrder = {
  clientId: string;
  kind: "table" | "takeaway" | "delivery";
  tableId?: string;
  channel?: string;
  customerName?: string;
  customerPhone?: string;
  orderNotes?: string;
  items: Array<{ menuItemId: string; quantity: number; notes?: string }>;
  comboMeals?: Array<{ comboMealId: string; quantity: number }>;
  promoCode?: string;
  createdAt: number;
};

type MenuCache = {
  restaurantId: string;
  categories: unknown[];
  cachedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ORDERS)) {
        db.createObjectStore(STORE_ORDERS, { keyPath: "clientId" });
      }
      if (!db.objectStoreNames.contains(STORE_MENU)) {
        db.createObjectStore(STORE_MENU, { keyPath: "restaurantId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function savePending(order: PendingOrder) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_ORDERS, "readwrite");
    tx.objectStore(STORE_ORDERS).put(order);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function listPending(): Promise<PendingOrder[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ORDERS, "readonly");
    const req = tx.objectStore(STORE_ORDERS).getAll();
    req.onsuccess = () => resolve(req.result as PendingOrder[]);
    req.onerror = () => reject(req.error);
  });
}

async function removePending(clientId: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_ORDERS, "readwrite");
    tx.objectStore(STORE_ORDERS).delete(clientId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function cacheStaffMenu(restaurantId: string, categories: unknown[]) {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_MENU, "readwrite");
    tx.objectStore(STORE_MENU).put({
      restaurantId,
      categories,
      cachedAt: Date.now(),
    } satisfies MenuCache);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadCachedStaffMenu(restaurantId: string): Promise<unknown[] | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MENU, "readonly");
    const req = tx.objectStore(STORE_MENU).get(restaurantId);
    req.onsuccess = () => {
      const row = req.result as MenuCache | undefined;
      if (!row) return resolve(null);
      const age = Date.now() - row.cachedAt;
      if (age > 24 * 60 * 60 * 1000) return resolve(null);
      resolve(row.categories);
    };
    req.onerror = () => reject(req.error);
  });
}

export function useOfflineOrderSync(enabled = true, restaurantId?: string) {
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [cachedMenu, setCachedMenu] = useState<unknown[] | null>(null);

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
    } catch {
      /* ignore network errors during offline sync */
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
    if (restaurantId) {
      void loadCachedStaffMenu(restaurantId).then(setCachedMenu).catch(() => undefined);
    }
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [enabled, refreshCount, syncPending, restaurantId]);

  const queueOrder = useCallback(
    async (order: Omit<PendingOrder, "clientId" | "createdAt">) => {
      const clientId = crypto.randomUUID();
      await savePending({ ...order, clientId, createdAt: Date.now() });
      await refreshCount();
      return clientId;
    },
    [refreshCount],
  );

  const storeMenu = useCallback(
    async (categories: unknown[]) => {
      if (!restaurantId) return;
      await cacheStaffMenu(restaurantId, categories);
      setCachedMenu(categories);
    },
    [restaurantId],
  );

  return { online, pendingCount, syncing, queueOrder, syncPending, cachedMenu, storeMenu };
}

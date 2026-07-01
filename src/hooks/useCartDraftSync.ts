"use client";

import { useEffect, useRef } from "react";
import type { CartItem } from "@/store/cart";

type CartDraftSource = "CUSTOMER" | "STAFF";

type SyncParams = {
  enabled?: boolean;
  source: CartDraftSource;
  tableId?: string | null;
  tableToken?: string;
  sessionKey?: string | null;
  items: CartItem[];
};

export function useCartDraftSync({
  enabled = true,
  source,
  tableId,
  tableToken,
  sessionKey,
  items,
}: SyncParams) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPayloadRef = useRef("");

  useEffect(() => {
    if (!enabled) return;

    const canSyncCustomer = source === "CUSTOMER" && tableToken && sessionKey;
    const canSyncStaff = source === "STAFF" && tableId;
    if (!canSyncCustomer && !canSyncStaff) return;

    const payload = JSON.stringify(
      items.map((item) => ({
        menuItemId: item.menuItemId,
        name: item.name,
        quantity: item.quantity,
      })),
    );

    if (payload === lastPayloadRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      lastPayloadRef.current = payload;
      try {
        await fetch("/api/tables/cart-draft", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            source,
            tableToken,
            tableId,
            sessionKey,
            items: JSON.parse(payload),
          }),
        });
      } catch {
        lastPayloadRef.current = "";
      }
    }, 400);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, source, tableId, tableToken, sessionKey, items]);
}

export async function clearRemoteCartDraft(params: {
  source: CartDraftSource;
  tableId?: string;
  tableToken?: string;
  sessionKey?: string;
}) {
  try {
    await fetch("/api/tables/cart-draft", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(params),
    });
  } catch {
    /* ignore network errors */
  }
}

"use client";

import { useEffect, useRef } from "react";
import {
  playNewKitchenChime,
  readStaffAlertsEnabled,
  showStaffBrowserNotification,
} from "@/lib/staff-alerts";

type KitchenAlertItem = {
  id: string;
  itemName: string;
  quantity: number;
  status: string;
  categorySlug: string;
};

type KitchenAlertTicket = {
  id: string;
  orderNumber: number;
  tableNumber: number;
  locationLabel?: string;
  items: KitchenAlertItem[];
};

function matchesCategoryFilter(categorySlug: string, selectedCategorySlugs: Set<string>) {
  return selectedCategorySlugs.size === 0 || selectedCategorySlugs.has(categorySlug);
}

export function useKitchenTicketAlerts(
  tickets: KitchenAlertTicket[],
  selectedCategorySlugs: Set<string>,
) {
  const seenPendingRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);

  useEffect(() => {
    if (!readStaffAlertsEnabled()) return;

    const pending = tickets.flatMap((ticket) =>
      ticket.items
        .filter((item) => item.status === "PENDING")
        .map((item) => ({ ticket, item })),
    );

    if (!seededRef.current) {
      for (const { item } of pending) {
        seenPendingRef.current.add(item.id);
      }
      seededRef.current = true;
      return;
    }

    const fresh = pending.filter(
      ({ item }) =>
        !seenPendingRef.current.has(item.id) &&
        matchesCategoryFilter(item.categorySlug, selectedCategorySlugs),
    );
    if (fresh.length === 0) return;

    for (const { ticket, item } of fresh) {
      seenPendingRef.current.add(item.id);
    }

    void playNewKitchenChime();

    const first = fresh[0]!;
    const location = first.ticket.locationLabel ?? `Table ${first.ticket.tableNumber}`;
    const extra = fresh.length > 1 ? ` (+${fresh.length - 1} more)` : "";
    showStaffBrowserNotification(
      `New kitchen ticket${fresh.length > 1 ? "s" : ""}`,
      `${first.item.quantity}x ${first.item.itemName} · ${location} · #${first.ticket.orderNumber}${extra}`,
      { tag: `new-kitchen-${first.item.id}`, urgent: true },
    );
  }, [tickets, selectedCategorySlugs]);
}

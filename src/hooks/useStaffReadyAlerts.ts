"use client";

import { useEffect, useRef } from "react";
import {
  playReadyBumpChime,
  readStaffAlertsEnabled,
  showStaffBrowserNotification,
} from "@/lib/staff-alerts";

type ReadyAlertOrder = {
  id: string;
  orderNumber: number;
  placedByUserId?: string | null;
  orderChannel?: string | null;
  table: { number: number; assignedServerId?: string | null };
  items: Array<{
    id: string;
    itemName: string;
    quantity: number;
    status: string;
  }>;
};

function shouldNotifyReady(order: ReadyAlertOrder, currentUserId: string) {
  const isPlacer = order.placedByUserId === currentUserId;
  const isAssignedServer = order.table.assignedServerId === currentUserId;
  const isStaffPlaced = Boolean(order.placedByUserId);
  return isPlacer || (isStaffPlaced && isAssignedServer);
}

export function useStaffReadyAlerts(
  orders: ReadyAlertOrder[],
  currentUserId: string | null | undefined,
) {
  const statusRef = useRef<Map<string, string>>(new Map());
  const seededRef = useRef(false);

  useEffect(() => {
    if (!readStaffAlertsEnabled() || !currentUserId) return;

    const rows = orders.flatMap((order) =>
      order.items.map((item) => ({ order, item })),
    );

    if (!seededRef.current) {
      for (const { item } of rows) {
        statusRef.current.set(item.id, item.status);
      }
      seededRef.current = true;
      return;
    }

    const readyNow: Array<{ order: ReadyAlertOrder; item: ReadyAlertOrder["items"][number] }> = [];

    for (const { order, item } of rows) {
      const prev = statusRef.current.get(item.id);
      statusRef.current.set(item.id, item.status);
      if (item.status !== "READY" || prev === "READY") continue;
      if (!shouldNotifyReady(order, currentUserId)) continue;
      readyNow.push({ order, item });
    }

    if (readyNow.length === 0) return;

    void playReadyBumpChime();

    const first = readyNow[0]!;
    const extra = readyNow.length > 1 ? ` (+${readyNow.length - 1} more)` : "";
    showStaffBrowserNotification(
      "Ready to bump",
      `${first.item.quantity}x ${first.item.itemName} · Table ${first.order.table.number} · #${first.order.orderNumber}${extra}`,
      { tag: `ready-bump-${first.item.id}`, urgent: true },
    );
  }, [orders, currentUserId]);
}

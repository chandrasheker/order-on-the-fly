"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getNotificationPermission,
  playAlarmBuzzer,
  playOverdueChime,
  readStaffAlertsEnabled,
  requestStaffNotificationPermission,
  showStaffBrowserNotification,
  writeStaffAlertsEnabled,
  type NotificationPermissionState,
} from "@/lib/staff-alerts";

export interface StaffAlertItem {
  id: string;
  type: string;
  message: string;
  tableNumber: number;
}

export function useStaffNotifications(alerts: StaffAlertItem[]) {
  const seenIdsRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermissionState>("default");
  const [showEnableBanner, setShowEnableBanner] = useState(false);

  useEffect(() => {
    setPermission(getNotificationPermission());
    const enabled = readStaffAlertsEnabled();
    setAlertsEnabled(enabled);
    setShowEnableBanner(!enabled && getNotificationPermission() !== "unsupported");
  }, []);

  const enableAlerts = useCallback(async () => {
    const perm = await requestStaffNotificationPermission();
    setPermission(perm);
    if (perm === "granted") {
      writeStaffAlertsEnabled(true);
      setAlertsEnabled(true);
      setShowEnableBanner(false);
      showStaffBrowserNotification(
        "Alerts enabled",
        "You will hear a buzzer when a table rings for service."
      );
      await playOverdueChime();
    } else if (perm === "denied") {
      setShowEnableBanner(true);
    }
  }, []);

  useEffect(() => {
    if (!alertsEnabled || permission !== "granted") return;

    if (!seededRef.current) {
      for (const alert of alerts) {
        seenIdsRef.current.add(alert.id);
      }
      seededRef.current = true;
      return;
    }

    const newAlerts = alerts.filter((a) => !seenIdsRef.current.has(a.id));
    if (newAlerts.length === 0) return;

    for (const alert of newAlerts) {
      seenIdsRef.current.add(alert.id);

      if (alert.type === "ALARM") {
        showStaffBrowserNotification(
          `🚨 Table ${alert.tableNumber} — Service alarm`,
          alert.message,
          { tag: `alarm-${alert.id}`, urgent: true }
        );
        void playAlarmBuzzer();
      } else if (alert.type === "OVERDUE") {
        showStaffBrowserNotification(
          `⏱ Overdue — Table ${alert.tableNumber}`,
          alert.message,
          { tag: `overdue-${alert.id}` }
        );
        void playOverdueChime();
      } else {
        showStaffBrowserNotification(`Table ${alert.tableNumber}`, alert.message, {
          tag: alert.id,
        });
      }
    }
  }, [alerts, alertsEnabled, permission]);

  return {
    alertsEnabled,
    permission,
    showEnableBanner,
    enableAlerts,
  };
}

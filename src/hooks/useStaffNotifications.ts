"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getNotificationPermission,
  playAlarmBuzzer,
  playOverdueChime,
  readStaffAlertsEnabled,
  requestStaffNotificationPermission,
  showStaffBrowserNotification,
  unlockAudio,
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
  const [enabling, setEnabling] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const perm = getNotificationPermission();
    setPermission(perm);
    const enabled = readStaffAlertsEnabled();
    setAlertsEnabled(enabled);
    setShowEnableBanner(!enabled);
  }, []);

  const enableAlerts = useCallback(async () => {
    setEnabling(true);
    setStatusMessage(null);

    try {
      // Always unlock sound on this click (user gesture)
      await unlockAudio();
      writeStaffAlertsEnabled(true);
      setAlertsEnabled(true);
      setShowEnableBanner(false);

      // Test chime so staff know sound works
      await playOverdueChime();

      let perm = getNotificationPermission();
      if (perm === "default") {
        perm = await requestStaffNotificationPermission();
      } else if (perm === "granted") {
        await unlockAudio();
      }
      setPermission(perm);

      if (perm === "granted") {
        showStaffBrowserNotification(
          "Alerts enabled",
          "Buzzer will sound when a table rings for service or items go overdue."
        );
        setStatusMessage("Alerts enabled — sound and notifications are on.");
      } else if (perm === "denied") {
        setStatusMessage(
          "Sound alerts enabled. To get pop-up notifications, allow notifications for this site in your browser settings."
        );
      } else if (perm === "unsupported") {
        setStatusMessage("Sound alerts enabled. This browser does not support notifications.");
      } else {
        setStatusMessage(
          "Sound alerts enabled. Allow notifications when prompted for pop-up alerts."
        );
      }
    } catch {
      setStatusMessage("Could not enable alerts. Try again or check browser settings.");
      setShowEnableBanner(true);
    } finally {
      setEnabling(false);
    }
  }, []);

  useEffect(() => {
    if (!alertsEnabled) return;

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
        if (permission === "granted") {
          showStaffBrowserNotification(
            `Table ${alert.tableNumber} — Service alarm`,
            alert.message,
            { tag: `alarm-${alert.id}`, urgent: true }
          );
        }
        void playAlarmBuzzer();
      } else if (alert.type === "OVERDUE") {
        if (permission === "granted") {
          showStaffBrowserNotification(
            `Overdue — Table ${alert.tableNumber}`,
            alert.message,
            { tag: `overdue-${alert.id}` }
          );
        }
        void playOverdueChime();
      } else if (permission === "granted") {
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
    enabling,
    statusMessage,
    enableAlerts,
  };
}

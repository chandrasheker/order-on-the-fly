import { prisma } from "@/lib/prisma";
import { logInfo, logWarn } from "@/lib/logger";
import { isFeatureEnabled } from "@/lib/feature-flags";

export type RealtimeEventType =
  | "NEW_ORDER"
  | "GUEST_SERVICE"
  | "OVERDUE"
  | "AGGREGATOR_ORDER"
  | "PAYMENT_RECEIVED"
  | "KITCHEN_PAUSED";

export async function dispatchRealtimeNotifications(params: {
  restaurantId: string;
  type: RealtimeEventType;
  title: string;
  body: string;
  tableNumber?: number;
  urgent?: boolean;
}) {
  const { restaurantId, type, title, body, tableNumber, urgent } = params;

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { pushAlertsEnabled: true, smsAlertsEnabled: true, slug: true },
  });
  if (!restaurant) return;

  const pushOn = await isFeatureEnabled(restaurantId, "push_alerts");
  if (pushOn && restaurant.pushAlertsEnabled) {
    const { sendPushToRestaurant } = await import("@/lib/push-notification-service");
    void sendPushToRestaurant(restaurantId, { title, body, tag: type, urgent });
  }

  if (restaurant.smsAlertsEnabled && process.env.SMS_WEBHOOK_URL) {
    const staffPhone = process.env.STAFF_ALERT_PHONE;
    if (staffPhone) {
      try {
        await fetch(process.env.SMS_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: staffPhone,
            message: `[${type}] ${title}: ${body}`,
            restaurantSlug: restaurant.slug,
            tableNumber,
          }),
        });
        logInfo("realtime:sms", "Staff SMS dispatched", { type, restaurantId });
      } catch (err) {
        logWarn("realtime:sms", "SMS dispatch failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}

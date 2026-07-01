import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { todayDateString } from "@/lib/utils";
import { dispatchRealtimeNotifications } from "@/lib/outbound-notification-service";

export async function getKitchenCapacityState(restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      kitchenPaused: true,
      kitchenPauseMessage: true,
      kitchenAutoPauseOverdueThreshold: true,
    },
  });
  if (!restaurant) {
    return { paused: false, message: null as string | null, overdueCount: 0 };
  }

  const today = todayDateString();
  const overdueCount = await prisma.orderItem.count({
    where: {
      isOverdue: true,
      status: { in: ["PENDING", "PREPARING"] },
      order: { restaurantId, date: today },
    },
  });

  return {
    paused: restaurant.kitchenPaused,
    message: restaurant.kitchenPauseMessage,
    overdueCount,
    autoPauseThreshold: restaurant.kitchenAutoPauseOverdueThreshold,
  };
}

export async function assertKitchenAcceptingOrders(restaurantId: string) {
  if (!(await isFeatureEnabled(restaurantId, "kitchen_capacity"))) {
    return { ok: true as const };
  }

  const state = await getKitchenCapacityState(restaurantId);
  if (state.paused) {
    return {
      ok: false as const,
      error:
        state.message ??
        "Kitchen is at capacity — new orders are paused briefly. Please ask your server.",
      code: "KITCHEN_PAUSED",
    };
  }
  return { ok: true as const };
}

export async function setKitchenPaused(params: {
  restaurantId: string;
  paused: boolean;
  message?: string | null;
  autoPauseOverdueThreshold?: number;
}) {
  const updated = await prisma.restaurant.update({
    where: { id: params.restaurantId },
    data: {
      kitchenPaused: params.paused,
      kitchenPauseMessage: params.message ?? null,
      ...(params.autoPauseOverdueThreshold !== undefined
        ? { kitchenAutoPauseOverdueThreshold: params.autoPauseOverdueThreshold }
        : {}),
    },
    select: {
      kitchenPaused: true,
      kitchenPauseMessage: true,
      kitchenAutoPauseOverdueThreshold: true,
    },
  });

  if (params.paused) {
    void dispatchRealtimeNotifications({
      restaurantId: params.restaurantId,
      type: "KITCHEN_PAUSED",
      title: "Kitchen paused",
      body: params.message ?? "New guest orders are paused until kitchen catches up.",
      urgent: true,
    });
  }

  return updated;
}

export async function maybeAutoPauseKitchen(restaurantId: string) {
  if (!(await isFeatureEnabled(restaurantId, "kitchen_capacity"))) return;

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { kitchenAutoPauseOverdueThreshold: true, kitchenPaused: true },
  });
  if (!restaurant || restaurant.kitchenPaused) return;
  const threshold = restaurant.kitchenAutoPauseOverdueThreshold;
  if (!threshold || threshold <= 0) return;

  const state = await getKitchenCapacityState(restaurantId);
  if (state.overdueCount >= threshold) {
    await setKitchenPaused({
      restaurantId,
      paused: true,
      message: `Auto-paused: ${state.overdueCount} overdue items in kitchen.`,
    });
  }
}

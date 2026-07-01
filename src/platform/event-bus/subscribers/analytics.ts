import type { EventSubscriber } from "@/platform/event-bus";
import { subscribe } from "@/platform/event-bus";
import { logInfo } from "@/lib/logger";

/** Analytics subscriber — events already persisted; this hook is for future rollups. */
const analyticsSubscriber: EventSubscriber = async (event) => {
  logInfo("analytics", "Platform event recorded", {
    type: event.type,
    restaurantId: event.restaurantId,
    entityId: event.entityId,
  });
};

subscribe("*", analyticsSubscriber);

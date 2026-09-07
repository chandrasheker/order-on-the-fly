export const RESTAURANT_SERVICE_MODES = ["FULL_SERVICE", "SELF_SERVICE", "HYBRID"] as const;
export type RestaurantServiceMode = (typeof RESTAURANT_SERVICE_MODES)[number];

export const ORDER_FULFILLMENT_MODES = ["TABLE_SERVICE", "SELF_PICKUP"] as const;
export type OrderFulfillmentMode = (typeof ORDER_FULFILLMENT_MODES)[number];

export const DEFAULT_RESTAURANT_SERVICE_MODE: RestaurantServiceMode = "FULL_SERVICE";
export const DEFAULT_ORDER_FULFILLMENT_MODE: OrderFulfillmentMode = "TABLE_SERVICE";
export const DEFAULT_PICKUP_LOCATION_LABEL = "Pickup Counter";
export const DEFAULT_HYBRID_FULFILLMENT: OrderFulfillmentMode = "TABLE_SERVICE";

export const PICKUP_LOCATION_MAX_LENGTH = 80;
export const SELF_PICKUP_COLLECTION_REMINDER_MS = 8 * 60 * 1000;
export const READY_AGING_WAITING_MS = 5 * 60 * 1000;
export const READY_AGING_OVERDUE_MS = 10 * 60 * 1000;

export type SelfPickupCustomerState =
  | "PREPARING"
  | "FOOD_READY_PAYMENT_REQUIRED"
  | "READY_FOR_COLLECTION"
  | "COLLECTED"
  | "CANCELLED";

export type ReadyAgingLevel = "NORMAL" | "WAITING" | "OVERDUE";

export function isRestaurantServiceMode(value: unknown): value is RestaurantServiceMode {
  return typeof value === "string" && (RESTAURANT_SERVICE_MODES as readonly string[]).includes(value);
}

export function isOrderFulfillmentMode(value: unknown): value is OrderFulfillmentMode {
  return typeof value === "string" && (ORDER_FULFILLMENT_MODES as readonly string[]).includes(value);
}

export function normalizeRestaurantServiceMode(value: unknown): RestaurantServiceMode {
  return isRestaurantServiceMode(value) ? value : DEFAULT_RESTAURANT_SERVICE_MODE;
}

export function normalizeOrderFulfillmentMode(value: unknown): OrderFulfillmentMode {
  return isOrderFulfillmentMode(value) ? value : DEFAULT_ORDER_FULFILLMENT_MODE;
}

export function allowedFulfillmentModes(serviceMode: RestaurantServiceMode): OrderFulfillmentMode[] {
  if (serviceMode === "SELF_SERVICE") return ["SELF_PICKUP"];
  if (serviceMode === "HYBRID") return ["TABLE_SERVICE", "SELF_PICKUP"];
  return ["TABLE_SERVICE"];
}

export function readyAgingLevel(readyAt: Date | null | undefined, now = new Date()): ReadyAgingLevel | null {
  if (!readyAt) return null;
  const elapsed = now.getTime() - readyAt.getTime();
  if (elapsed >= READY_AGING_OVERDUE_MS) return "OVERDUE";
  if (elapsed >= READY_AGING_WAITING_MS) return "WAITING";
  return "NORMAL";
}

export function generatePickupCode() {
  return String(1000 + Math.floor(Math.random() * 9000));
}

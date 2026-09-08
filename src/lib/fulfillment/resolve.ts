import {
  allowedFulfillmentModes,
  DEFAULT_HYBRID_FULFILLMENT,
  DEFAULT_ORDER_FULFILLMENT_MODE,
  DEFAULT_RESTAURANT_SERVICE_MODE,
  generatePickupCode,
  isOrderFulfillmentMode,
  normalizeOrderFulfillmentMode,
  normalizeRestaurantServiceMode,
  type OrderFulfillmentMode,
  type RestaurantServiceMode,
} from "@/lib/fulfillment/constants";
import { FulfillmentSelectionError } from "@/lib/fulfillment/errors";

export function snapshotFulfillmentMode(params: {
  serviceMode?: string | null;
  hybridDefaultFulfillment?: string | null;
  requested?: unknown;
}): OrderFulfillmentMode {
  const serviceMode = normalizeRestaurantServiceMode(params.serviceMode);
  const allowed = allowedFulfillmentModes(serviceMode);
  const requested = isOrderFulfillmentMode(params.requested) ? params.requested : null;

  if (serviceMode === "FULL_SERVICE") {
    return "TABLE_SERVICE";
  }
  if (serviceMode === "SELF_SERVICE") {
    return "SELF_PICKUP";
  }

  if (requested && allowed.includes(requested)) {
    return requested;
  }
  const fallback = normalizeOrderFulfillmentMode(params.hybridDefaultFulfillment || DEFAULT_HYBRID_FULFILLMENT);
  return allowed.includes(fallback) ? fallback : DEFAULT_ORDER_FULFILLMENT_MODE;
}

export function assertRequestedFulfillmentAllowed(params: {
  serviceMode?: string | null;
  requested?: unknown;
}) {
  if (params.requested == null || params.requested === "") return;
  if (!isOrderFulfillmentMode(params.requested)) {
    throw new FulfillmentSelectionError();
  }
  // Known but restaurant-disallowed modes are ignored; snapshotFulfillmentMode forces.
}

export function fulfillmentCreateFields(params: {
  serviceMode?: string | null;
  hybridDefaultFulfillment?: string | null;
  requested?: unknown;
}) {
  const fulfillmentMode = snapshotFulfillmentMode(params);
  return {
    fulfillmentMode,
    pickupCode: fulfillmentMode === "SELF_PICKUP" ? generatePickupCode() : null,
  };
}

export function restaurantServiceConfig(restaurant: {
  serviceMode?: string | null;
  pickupLocationLabel?: string | null;
  hybridDefaultFulfillment?: string | null;
}) {
  const serviceMode = normalizeRestaurantServiceMode(restaurant.serviceMode ?? DEFAULT_RESTAURANT_SERVICE_MODE);
  return {
    serviceMode,
    pickupLocationLabel: (restaurant.pickupLocationLabel || "Pickup Counter").trim() || "Pickup Counter",
    hybridDefaultFulfillment: normalizeOrderFulfillmentMode(restaurant.hybridDefaultFulfillment),
    allowedFulfillmentModes: allowedFulfillmentModes(serviceMode),
  };
}

export function publicServiceMode(restaurant: {
  serviceMode?: string | null;
  pickupLocationLabel?: string | null;
  hybridDefaultFulfillment?: string | null;
}) {
  const config = restaurantServiceConfig(restaurant);
  return {
    serviceMode: config.serviceMode as RestaurantServiceMode,
    pickupLocationLabel: config.pickupLocationLabel,
    hybridDefaultFulfillment: config.hybridDefaultFulfillment,
    allowedFulfillmentModes: config.allowedFulfillmentModes,
  };
}

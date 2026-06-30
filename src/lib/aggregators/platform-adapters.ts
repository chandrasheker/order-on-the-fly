import type { AggregatorPlatform } from "@/generated/prisma/client";

export type NormalizedAggregatorOrder = {
  externalOrderId: string;
  outletId?: string;
  customerName?: string;
  customerPhone?: string;
  orderNotes?: string;
  items: Array<{
    platformItemId?: string;
    itemName: string;
    quantity: number;
    notes?: string;
  }>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function pickString(obj: Record<string, unknown> | null, ...keys: string[]) {
  if (!obj) return undefined;
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.trim()) return val.trim();
    if (typeof val === "number") return String(val);
  }
  return undefined;
}

function normalizeItems(raw: unknown): NormalizedAggregatorOrder["items"] {
  if (!Array.isArray(raw)) return [];
  const items: NormalizedAggregatorOrder["items"] = [];

  for (const entry of raw) {
    const row = asRecord(entry);
    if (!row) continue;
    const itemName =
      pickString(row, "name", "item_name", "itemName", "dish_name", "title") ?? "";
    const quantity = Number(row.quantity ?? row.qty ?? row.count ?? 1);
    if (!itemName || !Number.isFinite(quantity) || quantity <= 0) continue;

    const addons = Array.isArray(row.addons)
      ? row.addons
          .map((addon) => pickString(asRecord(addon), "name", "item_name"))
          .filter(Boolean)
          .join(", ")
      : pickString(row, "addons", "variant", "customization");

    items.push({
      platformItemId: pickString(row, "item_id", "itemId", "dish_id", "catalogue_id"),
      itemName,
      quantity,
      notes: pickString(row, "instructions", "notes", "special_instructions") ?? addons,
    });
  }

  return items;
}

export function parseZomatoWebhook(body: unknown): NormalizedAggregatorOrder | null {
  const root = asRecord(body);
  if (!root) return null;

  const order = asRecord(root.order) ?? asRecord(root.data) ?? root;
  const externalOrderId =
    pickString(order, "order_id", "orderId", "id", "tab_id") ??
    pickString(root, "order_id", "orderId");

  if (!externalOrderId) return null;

  const customer = asRecord(order.customer) ?? asRecord(order.customer_details);
  const items =
    normalizeItems(order.items) ||
    normalizeItems(order.order_items) ||
    normalizeItems(order.dishes) ||
    normalizeItems(root.items);

  if (!items.length) return null;

  return {
    externalOrderId,
    outletId: pickString(order, "restaurant_id", "outlet_id", "store_id", "res_id"),
    customerName: pickString(customer, "name", "customer_name"),
    customerPhone: pickString(customer, "phone", "mobile", "phone_number"),
    orderNotes: pickString(order, "order_notes", "instructions", "special_instructions"),
    items,
  };
}

export function parseSwiggyWebhook(body: unknown): NormalizedAggregatorOrder | null {
  const root = asRecord(body);
  if (!root) return null;

  const order = asRecord(root.order) ?? asRecord(root.data) ?? asRecord(root.payload) ?? root;
  const externalOrderId =
    pickString(order, "order_id", "orderId", "id", "external_order_id") ??
    pickString(root, "order_id", "orderId");

  if (!externalOrderId) return null;

  const customer = asRecord(order.customer) ?? asRecord(order.customer_details);
  const items =
    normalizeItems(order.items) ||
    normalizeItems(order.orderItems) ||
    normalizeItems(order.order_items) ||
    normalizeItems(root.items);

  if (!items.length) return null;

  return {
    externalOrderId,
    outletId: pickString(order, "restaurant_id", "outlet_id", "store_id", "rest_id"),
    customerName: pickString(customer, "name", "customer_name"),
    customerPhone: pickString(customer, "phone", "mobile", "contact_number"),
    orderNotes: pickString(order, "order_notes", "instructions", "special_instructions"),
    items,
  };
}

export function parseGenericWebhook(
  platform: AggregatorPlatform,
  body: unknown
): NormalizedAggregatorOrder | null {
  if (platform === "ZOMATO") return parseZomatoWebhook(body);
  return parseSwiggyWebhook(body);
}

export function zomatoConfirmOrder(params: {
  apiKey: string;
  orderId: string;
  prepTimeMinutes?: number;
}) {
  const base = process.env.ZOMATO_API_BASE ?? "https://api.zomato.com";
  return fetch(`${base}/online-ordering/v1/order/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      order_id: params.orderId,
      prep_time: params.prepTimeMinutes ?? 20,
    }),
  });
}

export function swiggyConfirmOrder(params: {
  apiKey: string;
  apiSecret?: string;
  orderId: string;
  outletId?: string;
}) {
  const base = process.env.SWIGGY_API_BASE ?? "https://partner-api.swiggy.com";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${params.apiKey}`,
  };
  if (params.apiSecret) headers["X-Swiggy-Secret"] = params.apiSecret;

  return fetch(`${base}/api/v1/order/confirm`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      order_id: params.orderId,
      outlet_id: params.outletId,
      status: "CONFIRMED",
    }),
  });
}

export async function confirmOnPlatform(
  platform: AggregatorPlatform,
  creds: { apiKey: string; apiSecret?: string; outletId?: string },
  externalOrderId: string
) {
  if (platform === "ZOMATO") {
    return zomatoConfirmOrder({ apiKey: creds.apiKey, orderId: externalOrderId });
  }
  return swiggyConfirmOrder({
    apiKey: creds.apiKey,
    apiSecret: creds.apiSecret,
    orderId: externalOrderId,
    outletId: creds.outletId,
  });
}

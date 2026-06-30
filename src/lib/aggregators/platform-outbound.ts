import type { AggregatorPlatform } from "@/generated/prisma/client";

export type PlatformCredentials = {
  apiKey: string;
  apiSecret?: string;
  outletId?: string;
};

export type MenuSyncCategory = {
  name: string;
  slug: string;
  items: Array<{
    id: string;
    name: string;
    description: string | null;
    price: number;
    isAvailable: boolean;
    isVeg: boolean;
    swiggyItemId: string | null;
    zomatoItemId: string | null;
  }>;
};

function platformBase(platform: AggregatorPlatform) {
  return platform === "ZOMATO"
    ? (process.env.ZOMATO_API_BASE ?? "https://api.zomato.com")
    : (process.env.SWIGGY_API_BASE ?? "https://partner-api.swiggy.com");
}

function authHeaders(creds: PlatformCredentials) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${creds.apiKey}`,
  };
  if (creds.apiSecret) {
    headers[platformBase("SWIGGY") === headers.Authorization ? "X-Swiggy-Secret" : "X-Api-Secret"] =
      creds.apiSecret;
  }
  return headers;
}

export function buildMenuPayload(outletId: string, categories: MenuSyncCategory[]) {
  return {
    outlet_id: outletId,
    restaurant_id: outletId,
    categories: categories.map((cat) => ({
      name: cat.name,
      slug: cat.slug,
      items: cat.items.map((item) => ({
        item_id: item.id,
        catalogue_id: item.id,
        name: item.name,
        description: item.description ?? "",
        price: Math.round(item.price),
        in_stock: item.isAvailable,
        is_available: item.isAvailable,
        is_veg: item.isVeg,
        swiggy_item_id: item.swiggyItemId,
        zomato_item_id: item.zomatoItemId,
      })),
    })),
    synced_at: new Date().toISOString(),
  };
}

export async function pushMenuToPlatform(
  platform: AggregatorPlatform,
  creds: PlatformCredentials,
  categories: MenuSyncCategory[]
) {
  if (!creds.outletId) {
    return { ok: false as const, status: 400, body: "Outlet ID required" };
  }

  const payload = buildMenuPayload(creds.outletId, categories);
  const base = platformBase(platform);

  const path =
    platform === "ZOMATO"
      ? (process.env.ZOMATO_MENU_SYNC_PATH ?? "/online-ordering/v1/menu/sync")
      : (process.env.SWIGGY_MENU_SYNC_PATH ?? "/api/v1/menu/sync");

  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: authHeaders(creds),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });

  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text.slice(0, 500) };
}

export async function pushOrderReady(
  platform: AggregatorPlatform,
  creds: PlatformCredentials,
  externalOrderId: string
) {
  const base = platformBase(platform);
  const headers = authHeaders(creds);

  if (platform === "ZOMATO") {
    const path = process.env.ZOMATO_ORDER_READY_PATH ?? "/online-ordering/v1/order/ready";
    return fetch(`${base}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ order_id: externalOrderId }),
      signal: AbortSignal.timeout(15_000),
    });
  }

  const path = process.env.SWIGGY_ORDER_READY_PATH ?? "/api/v1/order/ready";
  return fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      order_id: externalOrderId,
      outlet_id: creds.outletId,
      status: "READY",
    }),
    signal: AbortSignal.timeout(15_000),
  });
}

export async function pushOrderPickedUp(
  platform: AggregatorPlatform,
  creds: PlatformCredentials,
  externalOrderId: string
) {
  const base = platformBase(platform);
  const headers = authHeaders(creds);

  if (platform === "ZOMATO") {
    const path = process.env.ZOMATO_ORDER_PICKEDUP_PATH ?? "/online-ordering/v1/order/pickedup";
    return fetch(`${base}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ order_id: externalOrderId }),
      signal: AbortSignal.timeout(15_000),
    });
  }

  const path = process.env.SWIGGY_ORDER_PICKEDUP_PATH ?? "/api/v1/order/pickedup";
  return fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      order_id: externalOrderId,
      outlet_id: creds.outletId,
      status: "PICKED_UP",
    }),
    signal: AbortSignal.timeout(15_000),
  });
}

export async function pushOrderDelivered(
  platform: AggregatorPlatform,
  creds: PlatformCredentials,
  externalOrderId: string
) {
  const base = platformBase(platform);
  const headers = authHeaders(creds);

  if (platform === "ZOMATO") {
    const path = process.env.ZOMATO_ORDER_DELIVERED_PATH ?? "/online-ordering/v1/order/delivered";
    return fetch(`${base}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ order_id: externalOrderId }),
      signal: AbortSignal.timeout(15_000),
    });
  }

  const path = process.env.SWIGGY_ORDER_DELIVERED_PATH ?? "/api/v1/order/delivered";
  return fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      order_id: externalOrderId,
      outlet_id: creds.outletId,
      status: "DELIVERED",
    }),
    signal: AbortSignal.timeout(15_000),
  });
}

export async function pushItemAvailability(
  platform: AggregatorPlatform,
  creds: PlatformCredentials,
  item: { platformItemId: string; name: string; isAvailable: boolean }
) {
  const base = platformBase(platform);
  const path =
    platform === "ZOMATO"
      ? (process.env.ZOMATO_ITEM_STOCK_PATH ?? "/online-ordering/v1/menu/item/stock")
      : (process.env.SWIGGY_ITEM_STOCK_PATH ?? "/api/v1/menu/item/stock");

  return fetch(`${base}${path}`, {
    method: "POST",
    headers: authHeaders(creds),
    body: JSON.stringify({
      outlet_id: creds.outletId,
      item_id: item.platformItemId,
      in_stock: item.isAvailable,
      is_available: item.isAvailable,
      name: item.name,
    }),
    signal: AbortSignal.timeout(15_000),
  });
}

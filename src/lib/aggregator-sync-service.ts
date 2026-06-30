import { prisma } from "@/lib/prisma";
import type { AggregatorPlatform, OrderChannel } from "@/generated/prisma/client";
import { decryptSecret } from "@/lib/credential-crypto";
import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  pushItemAvailability,
  pushMenuToPlatform,
  pushOrderDelivered,
  pushOrderPickedUp,
  pushOrderReady,
  type MenuSyncCategory,
} from "@/lib/aggregators/platform-outbound";
import { logInfo, logWarn } from "@/lib/logger";

const AGGREGATOR_CHANNELS: OrderChannel[] = ["SWIGGY", "ZOMATO"];

function channelToPlatform(channel: OrderChannel): AggregatorPlatform | null {
  if (channel === "SWIGGY") return "SWIGGY";
  if (channel === "ZOMATO") return "ZOMATO";
  return null;
}

async function getConnectionCreds(restaurantId: string, platform: AggregatorPlatform) {
  const row = await prisma.aggregatorConnection.findUnique({
    where: { restaurantId_platform: { restaurantId, platform } },
  });
  if (!row?.apiKeyEnc || !row.outletId) return null;
  return {
    connection: row,
    creds: {
      apiKey: decryptSecret(row.apiKeyEnc),
      apiSecret: decryptSecret(row.apiSecretEnc) || undefined,
      outletId: row.outletId,
    },
  };
}

export async function loadMenuForSync(restaurantId: string): Promise<MenuSyncCategory[]> {
  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { sortOrder: "asc" },
  });

  return categories.map((cat) => ({
    name: cat.name,
    slug: cat.slug,
    items: cat.items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      price: item.price,
      isAvailable: item.isAvailable,
      isVeg: item.isVeg,
      swiggyItemId: item.swiggyItemId,
      zomatoItemId: item.zomatoItemId,
    })),
  }));
}

export async function syncRestaurantMenuToAggregators(restaurantId: string, platform?: AggregatorPlatform) {
  const enabled = await isFeatureEnabled(restaurantId, "aggregator_inbox");
  if (!enabled) {
    return { ok: false as const, error: "Aggregator inbox not enabled" };
  }

  const categories = await loadMenuForSync(restaurantId);
  const platforms: AggregatorPlatform[] = platform ? [platform] : ["SWIGGY", "ZOMATO"];
  const results: Array<{ platform: AggregatorPlatform; ok: boolean; detail: string }> = [];

  for (const p of platforms) {
    const loaded = await getConnectionCreds(restaurantId, p);
    if (!loaded || !loaded.connection.autoMenuSync) {
      results.push({ platform: p, ok: false, detail: "Not configured or menu sync disabled" });
      continue;
    }

    const res = await pushMenuToPlatform(p, loaded.creds, categories);
    if (res.ok) {
      await prisma.aggregatorConnection.update({
        where: { id: loaded.connection.id },
        data: { lastMenuSyncAt: new Date(), lastError: null },
      });
      results.push({ platform: p, ok: true, detail: "Menu synced" });
      logInfo("aggregator:menu-sync", "Menu pushed", { restaurantId, platform: p });
    } else {
      const detail = `Menu sync failed (${res.status}): ${res.body}`;
      await prisma.aggregatorConnection.update({
        where: { id: loaded.connection.id },
        data: { lastError: detail.slice(0, 500) },
      });
      results.push({ platform: p, ok: false, detail });
    }
  }

  return { ok: results.some((r) => r.ok), results };
}

export async function syncMenuItemAvailability(
  restaurantId: string,
  itemId: string,
  isAvailable: boolean
) {
  const enabled = await isFeatureEnabled(restaurantId, "aggregator_inbox");
  if (!enabled) return;

  const item = await prisma.menuItem.findFirst({
    where: { id: itemId, category: { restaurantId } },
    select: { name: true, swiggyItemId: true, zomatoItemId: true },
  });
  if (!item) return;

  for (const platform of ["SWIGGY", "ZOMATO"] as AggregatorPlatform[]) {
    const loaded = await getConnectionCreds(restaurantId, platform);
    if (!loaded?.connection.autoMenuSync) continue;

    const platformItemId =
      platform === "SWIGGY" ? item.swiggyItemId ?? itemId : item.zomatoItemId ?? itemId;

    try {
      await pushItemAvailability(platform, loaded.creds, {
        platformItemId,
        name: item.name,
        isAvailable,
      });
    } catch (error) {
      logWarn("aggregator:item-stock", "Stock push failed", {
        restaurantId,
        platform,
        itemId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/** Fire-and-forget after menu edits when auto sync is on. */
export function scheduleMenuSync(restaurantId: string) {
  void syncRestaurantMenuToAggregators(restaurantId).catch(() => undefined);
}

export async function notifyAggregatorOrderStatus(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      restaurantId: true,
      orderChannel: true,
      externalOrderId: true,
      status: true,
      aggregatorReadyPushedAt: true,
      aggregatorPickedUpPushedAt: true,
    },
  });

  if (!order || !order.externalOrderId || !AGGREGATOR_CHANNELS.includes(order.orderChannel)) {
    return;
  }

  const platform = channelToPlatform(order.orderChannel);
  if (!platform) return;

  const enabled = await isFeatureEnabled(order.restaurantId, "aggregator_inbox");
  if (!enabled) return;

  const loaded = await getConnectionCreds(order.restaurantId, platform);
  if (!loaded?.connection.pushStatusUpdates) return;

  const { creds, connection } = loaded;

  try {
    if (order.status === "READY" && !order.aggregatorReadyPushedAt) {
      const res = await pushOrderReady(platform, creds, order.externalOrderId);
      if (res.ok) {
        await prisma.order.update({
          where: { id: orderId },
          data: { aggregatorReadyPushedAt: new Date() },
        });
        logInfo("aggregator:status", "Marked ready on platform", {
          orderId,
          platform,
          externalOrderId: order.externalOrderId,
        });
      } else {
        const text = await res.text();
        await prisma.aggregatorConnection.update({
          where: { id: connection.id },
          data: { lastError: `Ready push failed: ${text.slice(0, 200)}` },
        });
      }
    }

    if (order.status === "SERVED" && !order.aggregatorPickedUpPushedAt) {
      const pickedRes = await pushOrderPickedUp(platform, creds, order.externalOrderId);
      if (pickedRes.ok) {
        await prisma.order.update({
          where: { id: orderId },
          data: { aggregatorPickedUpPushedAt: new Date() },
        });
        logInfo("aggregator:status", "Marked picked up on platform", {
          orderId,
          platform,
        });

        if (order.orderChannel === "ZOMATO" || order.orderChannel === "SWIGGY") {
          void pushOrderDelivered(platform, creds, order.externalOrderId).catch(() => undefined);
        }
      } else {
        const text = await pickedRes.text();
        await prisma.aggregatorConnection.update({
          where: { id: connection.id },
          data: { lastError: `Picked up push failed: ${text.slice(0, 200)}` },
        });
      }
    }
  } catch (error) {
    logWarn("aggregator:status", "Status push error", {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function scheduleAggregatorStatusPush(orderId: string) {
  void notifyAggregatorOrderStatus(orderId).catch(() => undefined);
}

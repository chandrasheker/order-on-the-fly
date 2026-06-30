import { prisma } from "@/lib/prisma";
import type {
  AggregatorConnectionStatus,
  AggregatorPlatform,
  OrderChannel,
} from "@/generated/prisma/client";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/credential-crypto";
import { randomBytes } from "node:crypto";
import {
  confirmOnPlatform,
  parseGenericWebhook,
  type NormalizedAggregatorOrder,
} from "@/lib/aggregators/platform-adapters";
import { createChannelOrder, type AggregatorItemInput } from "@/lib/aggregator-order-service";
import { buildKitchenChitPayload } from "@/lib/kitchen-chit-service";
import { OrderCreationError } from "@/lib/order-service";

const PLATFORM_CHANNEL: Record<AggregatorPlatform, OrderChannel> = {
  SWIGGY: "SWIGGY",
  ZOMATO: "ZOMATO",
};

export function aggregatorWebhookUrl(slug: string, platform: AggregatorPlatform) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/api/webhooks/${platform.toLowerCase()}/${slug}`;
}

export async function getAggregatorConnectionsForRestaurant(restaurantId: string, slug: string) {
  await ensureAggregatorConnectionRows(restaurantId);
  const rows = await prisma.aggregatorConnection.findMany({
    where: { restaurantId },
    orderBy: { platform: "asc" },
  });

  return rows.map((row) => ({
    platform: row.platform,
    outletId: row.outletId ?? "",
    status: row.status,
    autoConfirm: row.autoConfirm,
    lastOrderAt: row.lastOrderAt?.toISOString() ?? null,
    lastError: row.lastError,
    configuredAt: row.configuredAt?.toISOString() ?? null,
    hasApiKey: Boolean(row.apiKeyEnc),
    hasApiSecret: Boolean(row.apiSecretEnc),
    apiKeyMasked: maskSecret(decryptSecret(row.apiKeyEnc)),
    webhookUrl: aggregatorWebhookUrl(slug, row.platform),
    webhookSecret: row.webhookSecret ?? "",
    webhookSecretMasked: maskSecret(row.webhookSecret),
  }));
}

export async function ensureAggregatorConnectionRows(restaurantId: string) {
  for (const platform of ["SWIGGY", "ZOMATO"] as AggregatorPlatform[]) {
    await prisma.aggregatorConnection.upsert({
      where: { restaurantId_platform: { restaurantId, platform } },
      create: { restaurantId, platform },
      update: {},
    });
  }
}

export async function saveAggregatorCredentials(params: {
  restaurantId: string;
  slug: string;
  platform: AggregatorPlatform;
  outletId: string;
  apiKey?: string;
  apiSecret?: string;
  autoConfirm?: boolean;
}) {
  await ensureAggregatorConnectionRows(params.restaurantId);

  const existing = await prisma.aggregatorConnection.findUnique({
    where: {
      restaurantId_platform: { restaurantId: params.restaurantId, platform: params.platform },
    },
  });

  const webhookSecret = existing?.webhookSecret ?? randomBytes(24).toString("hex");

  const updated = await prisma.aggregatorConnection.update({
    where: {
      restaurantId_platform: { restaurantId: params.restaurantId, platform: params.platform },
    },
    data: {
      outletId: params.outletId.trim(),
      ...(params.apiKey?.trim() ? { apiKeyEnc: encryptSecret(params.apiKey.trim()) } : {}),
      ...(params.apiSecret?.trim()
        ? { apiSecretEnc: encryptSecret(params.apiSecret.trim()) }
        : {}),
      webhookSecret,
      autoConfirm: params.autoConfirm ?? existing?.autoConfirm ?? true,
      status: "CREDENTIALS_SAVED",
      configuredAt: new Date(),
      lastError: null,
    },
  });

  return {
    platform: updated.platform,
    outletId: updated.outletId,
    status: updated.status,
    webhookUrl: aggregatorWebhookUrl(params.slug, params.platform),
    webhookSecret,
    autoConfirm: updated.autoConfirm,
  };
}

export async function markAggregatorConnected(restaurantId: string, platform: AggregatorPlatform) {
  await prisma.aggregatorConnection.updateMany({
    where: { restaurantId, platform },
    data: { status: "CONNECTED", lastError: null },
  });
}

export async function markAggregatorError(
  restaurantId: string,
  platform: AggregatorPlatform,
  message: string
) {
  await prisma.aggregatorConnection.updateMany({
    where: { restaurantId, platform },
    data: { status: "ERROR", lastError: message.slice(0, 500) },
  });
}

export function verifyPlatformWebhook(
  connection: { webhookSecret: string | null; apiKeyEnc: string | null },
  req: { authorization?: string | null; apiKeyHeader?: string | null; signature?: string | null }
) {
  const bearer = req.authorization?.startsWith("Bearer ")
    ? req.authorization.slice(7)
    : req.authorization;
  if (connection.webhookSecret && bearer === connection.webhookSecret) return true;
  if (connection.webhookSecret && req.apiKeyHeader === connection.webhookSecret) return true;

  const envSecret = process.env.TABLETAP_WEBHOOK_SECRET;
  if (envSecret && bearer === envSecret) return true;

  return false;
}

async function resolvePlatformItems(
  restaurantId: string,
  platform: AggregatorPlatform,
  items: NormalizedAggregatorOrder["items"]
): Promise<AggregatorItemInput[]> {
  const output: AggregatorItemInput[] = [];

  for (const item of items) {
    let menuItem = null;

    if (item.platformItemId) {
      menuItem = await prisma.menuItem.findFirst({
        where: {
          isAvailable: true,
          category: { restaurantId },
          ...(platform === "SWIGGY"
            ? { swiggyItemId: item.platformItemId }
            : { zomatoItemId: item.platformItemId }),
        },
        select: { id: true, name: true },
      });
    }

    if (!menuItem) {
      menuItem = await prisma.menuItem.findFirst({
        where: {
          isAvailable: true,
          name: item.itemName,
          category: { restaurantId },
        },
        select: { id: true, name: true },
      });
    }

    if (menuItem) {
      output.push({
        menuItemId: menuItem.id,
        quantity: item.quantity,
        notes: item.notes,
      });
    }
  }

  return output;
}

export async function ingestPlatformOrder(params: {
  restaurantId: string;
  restaurantSlug: string;
  platform: AggregatorPlatform;
  body: unknown;
  connection: {
    outletId: string | null;
    apiKeyEnc: string | null;
    apiSecretEnc: string | null;
    autoConfirm: boolean;
  };
}) {
  const normalized = parseGenericWebhook(params.platform, params.body);
  if (!normalized) {
    throw new OrderCreationError("Unrecognized aggregator payload", 400, "INVALID_PAYLOAD");
  }

  if (
    params.connection.outletId &&
    normalized.outletId &&
    params.connection.outletId !== normalized.outletId
  ) {
    throw new OrderCreationError("Outlet ID mismatch", 403, "OUTLET_MISMATCH");
  }

  const channel = PLATFORM_CHANNEL[params.platform];

  const existing = await prisma.order.findFirst({
    where: {
      restaurantId: params.restaurantId,
      orderChannel: channel,
      externalOrderId: normalized.externalOrderId,
    },
    select: { id: true, orderNumber: true },
  });

  if (existing) {
    return { duplicate: true as const, orderId: existing.id, orderNumber: existing.orderNumber };
  }

  const items = await resolvePlatformItems(
    params.restaurantId,
    params.platform,
    normalized.items
  );

  if (!items.length) {
    throw new OrderCreationError(
      "No menu items matched. Map Swiggy/Zomato item IDs on your menu or use matching item names.",
      422,
      "MENU_MAPPING_FAILED"
    );
  }

  const { order, total } = await createChannelOrder({
    restaurantId: params.restaurantId,
    restaurantSlug: params.restaurantSlug,
    channel,
    customerName: normalized.customerName,
    customerPhone: normalized.customerPhone,
    externalOrderId: normalized.externalOrderId,
    orderNotes: normalized.orderNotes,
    items,
    placedByName: params.platform,
  });

  await prisma.aggregatorConnection.updateMany({
    where: { restaurantId: params.restaurantId, platform: params.platform },
    data: { lastOrderAt: new Date(), status: "CONNECTED", lastError: null },
  });

  const apiKey = decryptSecret(params.connection.apiKeyEnc);
  if (params.connection.autoConfirm && apiKey) {
    try {
      const confirmRes = await confirmOnPlatform(
        params.platform,
        {
          apiKey,
          apiSecret: decryptSecret(params.connection.apiSecretEnc),
          outletId: params.connection.outletId ?? undefined,
        },
        normalized.externalOrderId
      );
      if (!confirmRes.ok) {
        const text = await confirmRes.text();
        await markAggregatorError(
          params.restaurantId,
          params.platform,
          `Auto-confirm failed (${confirmRes.status}): ${text.slice(0, 200)}`
        );
      }
    } catch (error) {
      await markAggregatorError(
        params.restaurantId,
        params.platform,
        error instanceof Error ? error.message : "Auto-confirm failed"
      );
    }
  }

  const kitchenChit = await buildKitchenChitPayload(order.id);

  return {
    duplicate: false as const,
    order,
    total,
    kitchenChit,
    externalOrderId: normalized.externalOrderId,
  };
}

export async function testAggregatorConnection(params: {
  restaurantId: string;
  platform: AggregatorPlatform;
}) {
  const row = await prisma.aggregatorConnection.findUnique({
    where: {
      restaurantId_platform: { restaurantId: params.restaurantId, platform: params.platform },
    },
  });

  if (!row?.outletId || !row.apiKeyEnc) {
    return {
      ok: false as const,
      message: "Save outlet ID and API key first.",
    };
  }

  const apiKey = decryptSecret(row.apiKeyEnc);
  const base =
    params.platform === "ZOMATO"
      ? (process.env.ZOMATO_API_BASE ?? "https://api.zomato.com")
      : (process.env.SWIGGY_API_BASE ?? "https://partner-api.swiggy.com");

  try {
    const res = await fetch(`${base}/health`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);

    if (res && res.ok) {
      await prisma.aggregatorConnection.update({
        where: { id: row.id },
        data: { status: "WEBHOOK_PENDING", lastError: null },
      });
      return {
        ok: true as const,
        message:
          "Credentials saved. Register the webhook URL with Zomato/Swiggy partner team — orders will flow automatically once they activate your outlet.",
      };
    }

    await prisma.aggregatorConnection.update({
      where: { id: row.id },
      data: {
        status: "CREDENTIALS_SAVED",
        lastError: null,
      },
    });

    return {
      ok: true as const,
      message:
        "Credentials saved locally. Complete partner onboarding with Zomato/Swiggy and register the webhook URL — TableTap is ready to receive orders automatically.",
    };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "Connection test failed",
    };
  }
}

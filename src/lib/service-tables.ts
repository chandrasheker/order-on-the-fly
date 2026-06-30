import { prisma } from "@/lib/prisma";
import { SERVICE_TABLE_DEFS } from "@/lib/order-channel";
import type { OrderChannel } from "@/generated/prisma/client";
import { randomBytes } from "node:crypto";

export async function ensureServiceTables(restaurantId: string, slug: string) {
  for (const def of SERVICE_TABLE_DEFS) {
    const existing = await prisma.table.findFirst({
      where: { restaurantId, number: def.number },
    });
    if (existing) {
      if (existing.kind !== def.kind || existing.serviceLabel !== def.serviceLabel) {
        await prisma.table.update({
          where: { id: existing.id },
          data: { kind: def.kind, serviceLabel: def.serviceLabel },
        });
      }
      continue;
    }

    await prisma.table.create({
      data: {
        number: def.number,
        kind: def.kind,
        serviceLabel: def.serviceLabel,
        qrToken: `${slug}-service-${def.number}`,
        restaurantId,
        orderingEnabled: true,
        isActive: true,
      },
    });
  }
}

export async function getServiceTableId(
  restaurantId: string,
  channel: OrderChannel
) {
  const def = SERVICE_TABLE_DEFS.find((entry) => entry.channel === channel);
  if (!def) return null;

  const table = await prisma.table.findFirst({
    where: { restaurantId, number: def.number },
    select: { id: true },
  });
  return table?.id ?? null;
}

export async function ensureAggregatorWebhookSecret(restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { aggregatorWebhookSecret: true },
  });
  if (restaurant?.aggregatorWebhookSecret) {
    return restaurant.aggregatorWebhookSecret;
  }

  const secret = randomBytes(24).toString("hex");
  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { aggregatorWebhookSecret: secret },
  });
  return secret;
}

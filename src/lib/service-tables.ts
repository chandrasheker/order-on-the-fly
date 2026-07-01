import { prisma } from "@/lib/prisma";
import { SERVICE_TABLE_DEFS } from "@/lib/order-channel";
import type { OrderChannel } from "@/generated/prisma/client";
import { randomBytes } from "node:crypto";
import {
  isServiceTablesReady,
  markServiceTablesReady,
} from "@/lib/restaurant-setup-cache";
import { Prisma } from "@/generated/prisma/client";

function serviceQrToken(slug: string, number: number) {
  return `${slug}-service-${number}`;
}

function isUniqueViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

async function resolveServiceTableScope(restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { tenantId: true },
  });
  const branch = await prisma.branch.findFirst({
    where: { restaurantId, isDefault: true },
    select: { id: true },
  });
  const floor = await prisma.floor.findFirst({
    where: { restaurantId, isDefault: true },
    select: { id: true },
  });
  return {
    tenantId: restaurant?.tenantId ?? null,
    branchId: branch?.id ?? null,
    floorId: floor?.id ?? null,
  };
}

export async function ensureServiceTables(restaurantId: string, slug: string) {
  if (isServiceTablesReady(restaurantId)) return;

  const scope = await resolveServiceTableScope(restaurantId);

  for (const def of SERVICE_TABLE_DEFS) {
    const existing = await prisma.table.findFirst({
      where: { restaurantId, number: def.number },
    });
    if (existing) {
      if (
        existing.kind !== def.kind ||
        existing.serviceLabel !== def.serviceLabel ||
        existing.tenantId !== scope.tenantId
      ) {
        await prisma.table.update({
          where: { id: existing.id },
          data: {
            kind: def.kind,
            serviceLabel: def.serviceLabel,
            tenantId: scope.tenantId,
            branchId: scope.branchId,
            floorId: scope.floorId,
          },
        });
      }
      continue;
    }

    const primaryToken = serviceQrToken(slug, def.number);
    const byToken = await prisma.table.findUnique({ where: { qrToken: primaryToken } });
    if (byToken) {
      if (byToken.restaurantId === restaurantId) continue;
      // Rare legacy/orphan token — use restaurant-scoped token
      const scopedToken = `${slug}-service-${def.number}-${restaurantId.slice(-8)}`;
      const scopedHit = await prisma.table.findUnique({ where: { qrToken: scopedToken } });
      if (scopedHit?.restaurantId === restaurantId) continue;

      try {
        await prisma.table.create({
          data: {
            number: def.number,
            kind: def.kind,
            serviceLabel: def.serviceLabel,
            qrToken: scopedHit ? `${scopedToken}-${randomBytes(3).toString("hex")}` : scopedToken,
            restaurantId,
            tenantId: scope.tenantId,
            branchId: scope.branchId,
            floorId: scope.floorId,
            orderingEnabled: true,
            isActive: true,
          },
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          const row = await prisma.table.findFirst({
            where: { restaurantId, number: def.number },
          });
          if (row) continue;
        }
        throw err;
      }
      continue;
    }

    try {
      await prisma.table.create({
        data: {
          number: def.number,
          kind: def.kind,
          serviceLabel: def.serviceLabel,
          qrToken: primaryToken,
          restaurantId,
          tenantId: scope.tenantId,
          branchId: scope.branchId,
          floorId: scope.floorId,
          orderingEnabled: true,
          isActive: true,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const row = await prisma.table.findFirst({
          where: { restaurantId, number: def.number },
        });
        if (row) continue;
        // Concurrent create won the race — verify token now belongs to us
        const winner = await prisma.table.findUnique({ where: { qrToken: primaryToken } });
        if (winner?.restaurantId === restaurantId) continue;
      }
      throw err;
    }
  }

  markServiceTablesReady(restaurantId);
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

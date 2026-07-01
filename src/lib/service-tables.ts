import { prisma } from "@/lib/prisma";
import { SERVICE_TABLE_DEFS } from "@/lib/order-channel";
import type { OrderChannel } from "@/generated/prisma/client";
import { randomBytes } from "node:crypto";
import {
  isServiceTablesReady,
  markServiceTablesReady,
} from "@/lib/restaurant-setup-cache";
import { Prisma } from "@/generated/prisma/client";
import { ensureDefaultBranch } from "@/lib/branch-service";
import { ensureDefaultFloor } from "@/domains/tables/floor-hierarchy";
import { ensureTenantForRestaurant } from "@/lib/tenant-service";

function serviceQrToken(slug: string, number: number) {
  return `${slug}-service-${number}`;
}

function isPrismaCode(error: unknown, code: string) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/** Ensure tenant + branch + floor exist before stamping FK fields on tables. */
async function resolveServiceTableScope(restaurantId: string) {
  const tenant = await ensureTenantForRestaurant(restaurantId);
  if (!tenant) {
    throw new Error("Restaurant not found");
  }
  const branch = await ensureDefaultBranch(restaurantId);
  const floor = await ensureDefaultFloor(branch.id, restaurantId);

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { tenantId: true },
  });

  return {
    tenantId: restaurant?.tenantId ?? null,
    branchId: branch.id,
    floorId: floor.id,
  };
}

type ServiceTableData = {
  number: number;
  kind: (typeof SERVICE_TABLE_DEFS)[number]["kind"];
  serviceLabel: string;
  qrToken: string;
  restaurantId: string;
  tenantId: string | null;
  branchId: string;
  floorId: string;
};

async function upsertServiceTableRow(data: ServiceTableData) {
  const existing = await prisma.table.findFirst({
    where: { restaurantId: data.restaurantId, number: data.number },
  });

  if (existing) {
    await prisma.table.update({
      where: { id: existing.id },
      data: {
        kind: data.kind,
        serviceLabel: data.serviceLabel,
        tenantId: data.tenantId,
        branchId: data.branchId,
        floorId: data.floorId,
        orderingEnabled: true,
        isActive: true,
      },
    });
    return existing;
  }

  const byToken = await prisma.table.findUnique({ where: { qrToken: data.qrToken } });
  if (byToken?.restaurantId === data.restaurantId) {
    return byToken;
  }

  let qrToken = data.qrToken;
  if (byToken && byToken.restaurantId !== data.restaurantId) {
    qrToken = `${data.qrToken}-${data.restaurantId.slice(-8)}`;
  }

  try {
    return await prisma.table.create({
      data: {
        number: data.number,
        kind: data.kind,
        serviceLabel: data.serviceLabel,
        qrToken,
        restaurantId: data.restaurantId,
        tenantId: data.tenantId,
        branchId: data.branchId,
        floorId: data.floorId,
        orderingEnabled: true,
        isActive: true,
      },
    });
  } catch (err) {
    if (isPrismaCode(err, "P2002")) {
      const row = await prisma.table.findFirst({
        where: { restaurantId: data.restaurantId, number: data.number },
      });
      if (row) return row;
      return prisma.table.create({
        data: {
          ...data,
          qrToken: `${qrToken}-${randomBytes(3).toString("hex")}`,
        },
      });
    }
    if (isPrismaCode(err, "P2003")) {
      // FK still invalid — create with hierarchy fields omitted (nullable)
      return prisma.table.create({
        data: {
          number: data.number,
          kind: data.kind,
          serviceLabel: data.serviceLabel,
          qrToken: `${qrToken}-${randomBytes(3).toString("hex")}`,
          restaurantId: data.restaurantId,
          orderingEnabled: true,
          isActive: true,
        },
      });
    }
    throw err;
  }
}

export async function ensureServiceTables(restaurantId: string, slug: string) {
  if (isServiceTablesReady(restaurantId)) return;

  const scope = await resolveServiceTableScope(restaurantId);

  for (const def of SERVICE_TABLE_DEFS) {
    await upsertServiceTableRow({
      number: def.number,
      kind: def.kind,
      serviceLabel: def.serviceLabel,
      qrToken: serviceQrToken(slug, def.number),
      restaurantId,
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      floorId: scope.floorId,
    });
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

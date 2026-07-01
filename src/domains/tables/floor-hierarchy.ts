import { prisma } from "@/lib/prisma";
import { ensureDefaultBranch } from "@/lib/branch-service";
import { resolveTenantContext } from "@/platform/tenant-context";

export async function ensureDefaultFloor(branchId: string, restaurantId: string) {
  const existing = await prisma.floor.findFirst({
    where: { branchId, isDefault: true },
  });
  if (existing) return existing;

  const ctx = await resolveTenantContext({ restaurantId, branchId });
  return prisma.floor.create({
    data: {
      branchId,
      restaurantId,
      tenantId: ctx.tenantId,
      name: "Ground Floor",
      slug: "ground",
      isDefault: true,
      sortOrder: 0,
    },
  });
}

export async function listFloors(restaurantId: string, branchId?: string) {
  const branch = branchId
    ? await prisma.branch.findFirst({ where: { id: branchId, restaurantId } })
    : await ensureDefaultBranch(restaurantId);
  if (!branch) throw new Error("Branch not found");

  await ensureDefaultFloor(branch.id, restaurantId);
  return prisma.floor.findMany({
    where: { branchId: branch.id, restaurantId },
    orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function resolveFloorIdForTable(tableId: string) {
  const table = await prisma.table.findUnique({
    where: { id: tableId },
    select: { floorId: true, branchId: true, restaurantId: true },
  });
  if (!table) return null;
  if (table.floorId) return table.floorId;

  const branchId =
    table.branchId ?? (await ensureDefaultBranch(table.restaurantId)).id;
  const floor = await ensureDefaultFloor(branchId, table.restaurantId);
  await prisma.table.update({
    where: { id: tableId },
    data: { floorId: floor.id, branchId },
  });
  return floor.id;
}

export async function resolveHierarchyForTable(tableId: string) {
  const table = await prisma.table.findUnique({
    where: { id: tableId },
    select: {
      id: true,
      restaurantId: true,
      tenantId: true,
      branchId: true,
      floorId: true,
    },
  });
  if (!table) throw new Error("Table not found");

  const branchId =
    table.branchId ?? (await ensureDefaultBranch(table.restaurantId)).id;
  const floorId = table.floorId ?? (await resolveFloorIdForTable(tableId))!;
  const ctx = await resolveTenantContext({
    restaurantId: table.restaurantId,
    branchId,
    floorId,
  });

  return {
    tenantId: ctx.tenantId,
    restaurantId: table.restaurantId,
    branchId,
    floorId,
  };
}

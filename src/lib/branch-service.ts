import { prisma } from "@/lib/prisma";

export async function ensureDefaultBranch(restaurantId: string) {
  const existing = await prisma.branch.findFirst({
    where: { restaurantId, isDefault: true },
  });
  if (existing) return existing;

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { name: true, slug: true },
  });
  if (!restaurant) throw new Error("Restaurant not found");

  return prisma.branch.create({
    data: {
      restaurantId,
      name: "Main",
      slug: "main",
      isDefault: true,
    },
  });
}

export async function listBranches(restaurantId: string) {
  await ensureDefaultBranch(restaurantId);
  return prisma.branch.findMany({
    where: { restaurantId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
}

export async function getDefaultBranchId(restaurantId: string) {
  const branch = await ensureDefaultBranch(restaurantId);
  return branch.id;
}

export async function resolveBranchIdForTable(tableId: string) {
  const table = await prisma.table.findUnique({
    where: { id: tableId },
    select: { branchId: true, restaurantId: true },
  });
  if (!table) return null;
  if (table.branchId) return table.branchId;
  return getDefaultBranchId(table.restaurantId);
}

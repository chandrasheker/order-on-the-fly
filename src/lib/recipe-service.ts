import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { recordAuditLog } from "@/lib/audit-service";
import type { IngredientUnit } from "@/generated/prisma/client";

export async function listIngredients(restaurantId: string) {
  return prisma.ingredient.findMany({
    where: { restaurantId },
    include: { recipeLines: { include: { menuItem: { select: { id: true, name: true } } } } },
    orderBy: { name: "asc" },
  });
}

export async function upsertIngredient(
  restaurantId: string,
  data: {
    id?: string;
    name: string;
    unit?: IngredientUnit;
    stockQuantity?: number;
    lowStockThreshold?: number;
  },
) {
  const payload = {
    name: data.name.trim(),
    unit: data.unit ?? "GRAM",
    stockQuantity: data.stockQuantity ?? 0,
    lowStockThreshold: data.lowStockThreshold ?? 0,
  };

  if (data.id) {
    return prisma.ingredient.update({ where: { id: data.id }, data: payload });
  }
  return prisma.ingredient.create({ data: { ...payload, restaurantId } });
}

export async function upsertRecipeLine(params: {
  restaurantId: string;
  menuItemId: string;
  ingredientId: string;
  quantity: number;
}) {
  const menuItem = await prisma.menuItem.findFirst({
    where: { id: params.menuItemId, category: { restaurantId: params.restaurantId } },
  });
  const ingredient = await prisma.ingredient.findFirst({
    where: { id: params.ingredientId, restaurantId: params.restaurantId },
  });
  if (!menuItem || !ingredient) throw new Error("Menu item or ingredient not found");

  return prisma.recipeLine.upsert({
    where: {
      menuItemId_ingredientId: {
        menuItemId: params.menuItemId,
        ingredientId: params.ingredientId,
      },
    },
    create: {
      menuItemId: params.menuItemId,
      ingredientId: params.ingredientId,
      quantity: params.quantity,
    },
    update: { quantity: params.quantity },
  });
}

export async function deductRecipeForOrder(
  restaurantId: string,
  items: Array<{ menuItemId: string; quantity: number }>,
) {
  if (!(await isFeatureEnabled(restaurantId, "inventory_86"))) return;

  for (const line of items) {
    const recipeLines = await prisma.recipeLine.findMany({
      where: { menuItemId: line.menuItemId },
      include: { ingredient: true },
    });
    if (!recipeLines.length) continue;

    for (const rl of recipeLines) {
      if (rl.ingredient.restaurantId !== restaurantId) continue;
      const deduct = rl.quantity * line.quantity;
      const next = Math.max(0, rl.ingredient.stockQuantity - deduct);
      await prisma.ingredient.update({
        where: { id: rl.ingredientId },
        data: { stockQuantity: next },
      });

      if (next <= rl.ingredient.lowStockThreshold) {
        await recordAuditLog({
          restaurantId,
          actionType: "STOCK_ADJUST",
          entityId: rl.ingredientId,
          reason: `Low stock: ${rl.ingredient.name} (${next} ${rl.ingredient.unit})`,
          payload: { ingredient: rl.ingredient.name, stockQuantity: next },
        });
      }
    }
  }
}

export async function getRecipeForMenuItem(menuItemId: string) {
  return prisma.recipeLine.findMany({
    where: { menuItemId },
    include: { ingredient: true },
  });
}

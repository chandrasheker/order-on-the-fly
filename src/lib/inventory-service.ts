import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { syncMenuItemAvailability } from "@/lib/aggregator-sync-service";
import { recordAuditLog } from "@/lib/audit-service";

export async function decrementInventoryForOrder(
  restaurantId: string,
  items: Array<{ menuItemId: string; quantity: number }>
) {
  if (!(await isFeatureEnabled(restaurantId, "inventory_86"))) return;

  for (const line of items) {
    const menuItem = await prisma.menuItem.findFirst({
      where: { id: line.menuItemId, category: { restaurantId }, trackInventory: true },
      select: { id: true, name: true, stockQuantity: true, isAvailable: true },
    });
    if (!menuItem || menuItem.stockQuantity == null) continue;

    const nextStock = Math.max(0, menuItem.stockQuantity - line.quantity);
    const should86 = nextStock <= 0;

    await prisma.menuItem.update({
      where: { id: menuItem.id },
      data: {
        stockQuantity: nextStock,
        ...(should86 ? { isAvailable: false } : {}),
      },
    });

    if (should86 && menuItem.isAvailable) {
      void syncMenuItemAvailability(restaurantId, menuItem.id, false);
    }
  }
}

export async function adjustMenuItemStock(params: {
  restaurantId: string;
  itemId: string;
  stockQuantity: number;
  trackInventory?: boolean;
  actorUserId?: string;
  actorName?: string;
}) {
  const item = await prisma.menuItem.findFirst({
    where: { id: params.itemId, category: { restaurantId: params.restaurantId } },
  });
  if (!item) throw new Error("Item not found");

  const track = params.trackInventory ?? item.trackInventory;
  const qty = Math.max(0, Math.floor(params.stockQuantity));
  const isAvailable = qty > 0;

  const updated = await prisma.menuItem.update({
    where: { id: params.itemId },
    data: {
      trackInventory: track,
      stockQuantity: track ? qty : null,
      isAvailable: track ? isAvailable : item.isAvailable,
    },
  });

  if (track) {
    void syncMenuItemAvailability(params.restaurantId, params.itemId, isAvailable);
    await recordAuditLog({
      restaurantId: params.restaurantId,
      actionType: "STOCK_ADJUST",
      entityId: params.itemId,
      reason: `Stock set to ${qty}`,
      payload: { itemName: item.name, stockQuantity: qty },
      actorUserId: params.actorUserId,
      actorName: params.actorName,
    });
  }

  return updated;
}

export async function listInventoryItems(restaurantId: string) {
  return prisma.menuItem.findMany({
    where: { category: { restaurantId } },
    select: {
      id: true,
      name: true,
      isAvailable: true,
      trackInventory: true,
      stockQuantity: true,
      lowStockThreshold: true,
      price: true,
      category: { select: { name: true } },
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });
}

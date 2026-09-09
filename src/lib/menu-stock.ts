import type { Prisma } from "@/generated/prisma/client";

export function isOutOfStock(item: {
  trackInventory?: boolean | null;
  stockQuantity?: number | null;
}) {
  return Boolean(item.trackInventory && item.stockQuantity != null && item.stockQuantity <= 0);
}

/** Live items plus tracked items that hit zero, so guests can see OUT OF STOCK. */
export const sellableOrOutOfStockWhere: Prisma.MenuItemWhereInput = {
  OR: [
    { isAvailable: true },
    { trackInventory: true, stockQuantity: { lte: 0 } },
  ],
};

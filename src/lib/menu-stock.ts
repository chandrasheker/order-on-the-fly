export function isOutOfStock(item: {
  trackInventory?: boolean | null;
  stockQuantity?: number | null;
}) {
  return Boolean(item.trackInventory && item.stockQuantity != null && item.stockQuantity <= 0);
}

/** Live items plus tracked items that hit zero, so guests can see OUT OF STOCK. */
export const sellableOrOutOfStockWhere = {
  OR: [
    { isAvailable: true },
    { trackInventory: true, stockQuantity: { lte: 0 } },
  ],
} as const;

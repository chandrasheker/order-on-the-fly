/**
 * Nested order-item authorization: item must belong to the already-scoped order
 * and restaurant before any payment check, transition, or update.
 */
export function ownedOrderItem<T extends { id: string }>(
  order: { restaurantId: string; items: T[] } | null | undefined,
  itemId: unknown,
  restaurantId: string,
): T | null {
  if (!order || !restaurantId || order.restaurantId !== restaurantId) return null;
  if (typeof itemId !== "string" || itemId.length === 0) return null;
  return order.items.find((item) => item.id === itemId) ?? null;
}

/** Drop client-supplied item IDs that are not on the scoped order. */
export function scopedOrderItemIds(
  order: { items: { id: string }[] } | null | undefined,
  itemIds: unknown,
): string[] | undefined {
  if (!order || !Array.isArray(itemIds)) return undefined;
  const allowed = new Set(order.items.map((item) => item.id));
  const scoped = itemIds.filter((id): id is string => typeof id === "string" && allowed.has(id));
  return scoped;
}

export function hasOnlyForeignOrderItemIds(
  order: { items: { id: string }[] } | null | undefined,
  itemIds: unknown,
): boolean {
  if (!order || !Array.isArray(itemIds) || itemIds.length === 0) return false;
  return (scopedOrderItemIds(order, itemIds) ?? []).length === 0;
}

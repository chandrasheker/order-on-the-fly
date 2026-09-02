import { ownedOrderItem } from "@/lib/order-item-guard";

export type ItemActionFailure =
  | { ok: false; status: 404; error: "Not found"; item: null }
  | { ok: false; status: 400; error: string; item: { id: string } };

export type ItemActionReady<T extends { id: string }> = {
  ok: true;
  item: T;
};

/**
 * Prove itemId belongs to the already hostname/session-scoped order
 * before any payment check, transition, alert, or update.
 */
export function requireOwnedOrderItem<T extends { id: string }>(
  order: { restaurantId: string; items: T[] },
  itemId: unknown,
  restaurantId: string,
): ItemActionReady<T> | Extract<ItemActionFailure, { status: 404 }> {
  const item = ownedOrderItem(order, itemId, restaurantId);
  if (!item) {
    return { ok: false, status: 404, error: "Not found", item: null };
  }
  return { ok: true, item };
}

export async function requireOwnedOrderItemWithoutPayment<T extends { id: string }>(
  order: { restaurantId: string; items: T[] },
  itemId: unknown,
  restaurantId: string,
  hasPayment: (ownedItemId: string) => Promise<boolean>,
): Promise<ItemActionReady<T> | ItemActionFailure> {
  const owned = requireOwnedOrderItem(order, itemId, restaurantId);
  if (!owned.ok) return owned;
  if (await hasPayment(owned.item.id)) {
    return {
      ok: false,
      status: 400,
      error: "Cannot reject an item that has payment applied",
      item: owned.item,
    };
  }
  return owned;
}

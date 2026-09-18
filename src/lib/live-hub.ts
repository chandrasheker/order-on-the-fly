export type LivePing = {
  restaurantId: string;
  type?: string;
  tableId?: string | null;
  entityId?: string | null;
};

type LiveListener = (ping: LivePing) => void;

const listenersByRestaurant = new Map<string, Set<LiveListener>>();

export function pingLive(ping: LivePing) {
  if (!ping.restaurantId) return;
  const listeners = listenersByRestaurant.get(ping.restaurantId);
  if (!listeners || listeners.size === 0) return;
  for (const listener of listeners) {
    try {
      listener(ping);
    } catch {
      /* a slow UI client must not break other subscribers */
    }
  }
}

export function subscribeLive(restaurantId: string, listener: LiveListener) {
  let listeners = listenersByRestaurant.get(restaurantId);
  if (!listeners) {
    listeners = new Set();
    listenersByRestaurant.set(restaurantId, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners!.delete(listener);
    if (listeners!.size === 0) listenersByRestaurant.delete(restaurantId);
  };
}

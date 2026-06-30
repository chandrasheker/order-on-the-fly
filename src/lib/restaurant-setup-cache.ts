/**
 * In-process cache so ensure* helpers run once per restaurant per process.
 * Avoids repeated upserts on every dashboard poll.
 */
const serviceTablesReady = new Set<string>();
const aggregatorRowsReady = new Set<string>();

export function markServiceTablesReady(restaurantId: string) {
  serviceTablesReady.add(restaurantId);
}

export function isServiceTablesReady(restaurantId: string) {
  return serviceTablesReady.has(restaurantId);
}

export function markAggregatorRowsReady(restaurantId: string) {
  aggregatorRowsReady.add(restaurantId);
}

export function isAggregatorRowsReady(restaurantId: string) {
  return aggregatorRowsReady.has(restaurantId);
}

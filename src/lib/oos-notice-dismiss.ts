const DISMISS_KEY_PREFIX = "tabletap-oos-dismissed";

function storageKey(tableToken: string) {
  return `${DISMISS_KEY_PREFIX}:${tableToken}`;
}

export function readDismissedOutOfStockOrderIds(tableToken: string): string[] {
  if (typeof window === "undefined" || !tableToken) return [];
  try {
    const raw = localStorage.getItem(storageKey(tableToken));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function dismissOutOfStockOrder(tableToken: string, orderId: string) {
  if (!tableToken) return;
  const next = [...new Set([...readDismissedOutOfStockOrderIds(tableToken), orderId])];
  localStorage.setItem(storageKey(tableToken), JSON.stringify(next));
}

export function isOutOfStockNoticeDismissed(tableToken: string, orderId: string) {
  return readDismissedOutOfStockOrderIds(tableToken).includes(orderId);
}

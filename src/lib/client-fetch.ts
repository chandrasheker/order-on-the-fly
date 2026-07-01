/** Browser-side helpers for fetch polling and user actions. */

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function isClientOffline(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

/** Transient network failure from `fetch()` (offline, dev reload, navigation). */
export function isNetworkFetchError(error: unknown): boolean {
  if (isAbortError(error)) return true;
  return error instanceof TypeError && error.message === "Failed to fetch";
}

/** Swallow abort/network errors from background polling — avoids unhandledRejection noise. */
export function swallowPollingFetchError(error: unknown): void {
  if (isNetworkFetchError(error)) return;
  console.warn("Polling fetch failed:", error);
}

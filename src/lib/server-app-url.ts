/**
 * Server/runtime base URL for QR codes, webhooks, and aggregator callbacks.
 *
 * Uses APP_URL (read at runtime). Do NOT use NEXT_PUBLIC_APP_URL here — Next/Turbopack
 * inlines NEXT_PUBLIC_* at compile time, so stale values survive in .next after .env edits.
 */
export function getAppBaseUrl(): string {
  const raw = process.env.APP_URL || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

export function getTableCheckInUrl(slug: string, qrToken: string): string {
  return `${getAppBaseUrl()}/order/${slug}/${qrToken}/check-in`;
}

export function getTableOrderUrl(slug: string, qrToken: string): string {
  return getTableCheckInUrl(slug, qrToken);
}

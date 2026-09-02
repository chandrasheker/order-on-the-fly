/**
 * Server/runtime base URL for QR codes, webhooks, and aggregator callbacks.
 *
 * Uses APP_URL (read at runtime). Do NOT use NEXT_PUBLIC_APP_URL here — Next/Turbopack
 * inlines NEXT_PUBLIC_* at compile time, so stale values survive in .next after .env edits.
 *
 * When TENANT_BASE_DOMAIN is set, restaurant guest URLs use
 * `{protocol}://{slug}.{TENANT_BASE_DOMAIN}[:port]`.
 */
import { getTenantBaseDomain } from "@/platform/host";

export function getAppBaseUrl(): string {
  const raw = process.env.APP_URL || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

export function getHostPublicBaseUrl(slug: string): string {
  return getRestaurantPublicBaseUrl(slug);
}

export function getTenantHubPublicBaseUrl(slug: string): string {
  return getRestaurantPublicBaseUrl(slug);
}

export function getRestaurantPublicBaseUrl(slug: string): string {
  const baseDomain = getTenantBaseDomain();
  if (!baseDomain) return getAppBaseUrl();

  let proto = process.env.TENANT_PUBLIC_PROTOCOL;
  let port = process.env.TENANT_PUBLIC_PORT ?? "";
  if (!proto) {
    try {
      const parsed = new URL(getAppBaseUrl());
      proto = parsed.protocol.replace(":", "") || "https";
      if (!port && parsed.port && (baseDomain === "localhost" || parsed.hostname.endsWith(".localhost"))) {
        port = parsed.port;
      }
    } catch {
      proto = process.env.NODE_ENV === "production" ? "https" : "http";
    }
  }

  const suffix = port ? `:${port}` : "";
  return `${proto}://${slug}.${baseDomain}${suffix}`;
}

export function getTableCheckInUrl(slug: string, qrToken: string): string {
  return `${getRestaurantPublicBaseUrl(slug)}/order/${slug}/${qrToken}/check-in`;
}

export function getTableOrderUrl(slug: string, qrToken: string): string {
  return getTableCheckInUrl(slug, qrToken);
}

export function publicRestaurantPayload(restaurant: { id: string; name: string; slug: string }) {
  return {
    id: restaurant.id,
    name: restaurant.name,
    slug: restaurant.slug,
    url: getRestaurantPublicBaseUrl(restaurant.slug),
  };
}

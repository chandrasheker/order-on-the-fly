/**
 * Hostname parsing for restaurant subdomain tenancy.
 *
 * Edge-safe: no Prisma, no Node-only APIs. Safe to import from middleware.
 *
 * Reverse proxy:
 * - The proxy MUST preserve the original Host (Caddy/Nginx default).
 * - X-Forwarded-Host is ignored unless TRUST_FORWARDED_HOST=1.
 * - When trusted, only a single host value is accepted (comma lists are rejected
 *   so a client cannot prepend a spoofed host).
 * - Do not expose the Node/Next port publicly if you enable TRUST_FORWARDED_HOST.
 */

export const HOST_KIND = {
  RESTAURANT: "restaurant",
  RESERVED: "reserved",
  INVALID: "invalid",
} as const;

export type HostKind = (typeof HOST_KIND)[keyof typeof HOST_KIND];

export type ClassifiedHost =
  | { kind: "restaurant"; hostname: string; slug: string; baseDomain: string }
  | { kind: "reserved"; hostname: string; legacyRestaurantScoping: boolean }
  | { kind: "invalid"; hostname: string; reason: string };

function reservedHost(hostname: string, production: boolean): Extract<ClassifiedHost, { kind: "reserved" }> {
  return { kind: "reserved", hostname, legacyRestaurantScoping: !production };
}

/** Labels that must never be treated as a restaurant slug. */
export const RESERVED_SUBDOMAINS = new Set([
  "www",
  "platform",
  "admin",
  "api",
  "app",
  "mail",
  "ftp",
  "ns1",
  "ns2",
  "static",
  "assets",
  "cdn",
  "health",
  "status",
  "tenant",
  "signup",
  "localhost",
]);

const DNS_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export function getTenantBaseDomain(): string {
  return (process.env.TENANT_BASE_DOMAIN ?? "").trim().toLowerCase().replace(/^\.+|\.+$/g, "");
}

export function trustForwardedHost(): boolean {
  return process.env.TRUST_FORWARDED_HOST === "1";
}

export function isValidRestaurantSubdomainSlug(slug: string): boolean {
  const normalized = String(slug || "").trim().toLowerCase();
  if (!DNS_SLUG_RE.test(normalized)) return false;
  if (RESERVED_SUBDOMAINS.has(normalized)) return false;
  return true;
}

export function normalizeRestaurantSlug(slug: string): string {
  return String(slug || "").trim().toLowerCase();
}

export function restaurantSlugValidationError(slug: string): string | null {
  const normalized = normalizeRestaurantSlug(slug);
  if (!normalized) return "Restaurant slug is required";
  if (RESERVED_SUBDOMAINS.has(normalized)) {
    return `Slug "${normalized}" is reserved and cannot be used as a subdomain`;
  }
  if (!DNS_SLUG_RE.test(normalized)) {
    return "Slug must be a DNS label: lowercase letters, digits, and hyphens (1–63 chars, no leading/trailing hyphen)";
  }
  return null;
}

/** Strip port and brackets; lowercase. Empty string if unusable. */
export function normalizeHostname(raw: string | null | undefined): string {
  if (!raw) return "";
  let host = String(raw).trim().toLowerCase();
  if (!host || host.includes("/") || host.includes(" ") || host.includes(",")) return "";

  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    if (end === -1) return "";
    const ip = host.slice(1, end);
    const rest = host.slice(end + 1);
    if (rest && !/^:\d+$/.test(rest)) return "";
    return ip;
  }

  // hostname:port — but not IPv6 without brackets
  if ((host.match(/:/g) || []).length === 1) {
    host = host.split(":")[0] ?? "";
  }

  if (host.endsWith(".")) host = host.slice(0, -1);
  return host;
}

export function isIpHostname(hostname: string): boolean {
  if (!hostname) return true;
  if (IPV4_RE.test(hostname)) return true;
  if (hostname.includes(":")) return true; // IPv6
  return false;
}

export function isProductionEnv(nodeEnv?: string): boolean {
  return (nodeEnv ?? process.env.NODE_ENV) === "production";
}

/** Apex domain used for `{slug}.{domain}` — required in production. */
export function isValidTenantBaseDomain(domain: string): boolean {
  const value = String(domain || "").trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (!value) return false;
  if (value === "localhost" || value.endsWith(".localhost")) return false;
  if (isIpHostname(value)) return false;
  if (!value.includes(".")) return false;
  if (value.includes("/") || value.includes(" ") || value.includes(":")) return false;
  return true;
}

/** Explicit opt-in: serve restaurant login/QR on the configured apex (single-host deploys). */
export function isApexRestaurantModeEnabled(): boolean {
  return process.env.TENANT_APEX_RESTAURANT === "1";
}

/** Configured apex or www.{apex} — not platform.* and not an arbitrary reserved host. */
export function isConfiguredApexHost(
  host?: ClassifiedHost,
  options?: { baseDomain?: string },
): boolean {
  if (!host || host.kind !== "reserved") return false;
  const base = (options?.baseDomain ?? getTenantBaseDomain()).toLowerCase();
  if (!base) return false;
  return host.hostname === base || host.hostname === `www.${base}`;
}

/** GET `/` on the configured apex may render a directory page even when restaurant ops are blocked. */
export function allowsApexPublicLanding(
  pathname: string,
  host?: ClassifiedHost,
  options?: { baseDomain?: string },
): boolean {
  return pathname === "/" && isConfiguredApexHost(host, options);
}

/**
 * Reserved hosts may use path/session restaurant scoping in development
 * (bare localhost / LAN). Production reserved hosts stay platform-only unless
 * TENANT_APEX_RESTAURANT=1 is set for the configured apex / www.
 */
export function allowsLegacyRestaurantScoping(
  host?: ClassifiedHost,
  nodeEnv?: string,
): boolean {
  if (!host || host.kind !== "reserved") return false;
  if (!isProductionEnv(nodeEnv)) return host.legacyRestaurantScoping;
  return isApexRestaurantModeEnabled() && isConfiguredApexHost(host);
}

function extraReservedHosts(): Set<string> {
  const raw = process.env.TENANT_RESERVED_HOSTS ?? "";
  return new Set(
    raw
      .split(",")
      .map((h) => normalizeHostname(h))
      .filter(Boolean),
  );
}

/**
 * Read the request hostname.
 * Prefers Host. Uses X-Forwarded-Host only when TRUST_FORWARDED_HOST=1 and the
 * header contains exactly one host (no comma-separated chain).
 */
export function getTrustedHostname(headers: Headers | { get(name: string): string | null }): string {
  if (trustForwardedHost()) {
    const forwarded = headers.get("x-forwarded-host");
    if (forwarded) {
      const trimmed = forwarded.trim();
      if (trimmed && !trimmed.includes(",")) {
        return normalizeHostname(trimmed);
      }
    }
  }
  return normalizeHostname(headers.get("host"));
}

export function classifyHostname(
  hostname: string,
  options?: { baseDomain?: string; nodeEnv?: string },
): ClassifiedHost {
  const host = normalizeHostname(hostname);
  if (!host) return { kind: "invalid", hostname: "", reason: "missing_host" };

  const baseDomain = (options?.baseDomain ?? getTenantBaseDomain()).toLowerCase();
  const reserved = extraReservedHosts();

  const nodeEnv = options?.nodeEnv ?? process.env.NODE_ENV;
  const production = isProductionEnv(nodeEnv);

  if (production && !baseDomain) {
    return { kind: "invalid", hostname: host, reason: "missing_tenant_base_domain" };
  }

  if (reserved.has(host)) {
    if (production && (isIpHostname(host) || host === "localhost")) {
      return { kind: "invalid", hostname: host, reason: "production_dev_host" };
    }
    return reservedHost(host, production);
  }

  if (isIpHostname(host) || host === "localhost") {
    if (production) return { kind: "invalid", hostname: host, reason: "production_dev_host" };
    return reservedHost(host, production);
  }

  const labels = host.split(".").filter(Boolean);
  if (labels.length < 2) {
    return { kind: "invalid", hostname: host, reason: "malformed_host" };
  }

  // Dev only: {slug}.localhost
  if (labels.length === 2 && labels[1] === "localhost") {
    if (production) return { kind: "invalid", hostname: host, reason: "production_dev_host" };
    const slug = labels[0] ?? "";
    if (!isValidRestaurantSubdomainSlug(slug)) {
      return { kind: "invalid", hostname: host, reason: "invalid_slug" };
    }
    return { kind: "restaurant", hostname: host, slug, baseDomain: "localhost" };
  }

  if (baseDomain) {
    if (host === baseDomain) return reservedHost(host, production);
    const suffix = `.${baseDomain}`;
    if (host.endsWith(suffix)) {
      const prefix = host.slice(0, -suffix.length);
      const prefixLabels = prefix.split(".").filter(Boolean);
      if (prefixLabels.length !== 1) {
        return { kind: "invalid", hostname: host, reason: "nested_subdomain" };
      }
      const slug = prefixLabels[0] ?? "";
      if (RESERVED_SUBDOMAINS.has(slug)) {
        return reservedHost(host, production);
      }
      if (!isValidRestaurantSubdomainSlug(slug)) {
        return { kind: "invalid", hostname: host, reason: "invalid_slug" };
      }
      return { kind: "restaurant", hostname: host, slug, baseDomain };
    }

    if (production) {
      return { kind: "invalid", hostname: host, reason: "unknown_host" };
    }
    return reservedHost(host, production);
  }

  // Development without TENANT_BASE_DOMAIN: only {slug}.localhost is a restaurant
  // host. Apex / LAN stay reserved so path-based QR and session login still work.
  return reservedHost(host, production);
}

export function classifyRequestHost(
  headers: Headers | { get(name: string): string | null },
  options?: { baseDomain?: string; nodeEnv?: string },
): ClassifiedHost {
  return classifyHostname(getTrustedHostname(headers), options);
}

/**
 * Production reserved/invalid hosts must not run restaurant guest/staff operations.
 * Privileged platform/health/webhook/job paths are exempt at the middleware layer.
 */
export function blocksRestaurantOperationsOnHost(
  host: ClassifiedHost,
  nodeEnv?: string,
): boolean {
  if (host.kind === "invalid") return true;
  if (host.kind === "reserved") {
    return !allowsLegacyRestaurantScoping(host, nodeEnv);
  }
  return false;
}

export function sessionMatchesHostSlug(
  sessionSlug: string | null | undefined,
  host: ClassifiedHost,
  nodeEnv?: string,
): boolean {
  if (host.kind === "invalid") return false;
  if (host.kind === "reserved") return allowsLegacyRestaurantScoping(host, nodeEnv);
  if (!sessionSlug) return false;
  return normalizeRestaurantSlug(sessionSlug) === host.slug;
}

/** Fail closed: inability to read the request host must not authorize. */
export async function sessionAllowedFromHeaders(
  sessionSlug: string | null | undefined,
  readHeaders: () => Promise<Headers | { get(name: string): string | null }>,
  nodeEnv?: string,
): Promise<boolean> {
  let headerList: Headers | { get(name: string): string | null };
  try {
    headerList = await readHeaders();
  } catch {
    return false;
  }
  return sessionMatchesHostSlug(sessionSlug, classifyRequestHost(headerList, { nodeEnv }), nodeEnv);
}

export function pathSlugMatchesHost(pathSlug: string | null | undefined, host: ClassifiedHost): boolean {
  if (host.kind !== "restaurant") return true;
  if (!pathSlug) return false;
  return normalizeRestaurantSlug(pathSlug) === host.slug;
}

export const HOST_SLUG_HEADER = "x-tabletap-host-slug";
export const HOST_KIND_HEADER = "x-tabletap-host-kind";
export const HOST_NAME_HEADER = "x-tabletap-hostname";

export function selectOwnedResource<T extends { restaurantId: string }>(
  hostRestaurantId: string | null,
  resource: T | null | undefined,
): T | null {
  if (!resource) return null;
  if (hostRestaurantId && resource.restaurantId !== hostRestaurantId) return null;
  return resource;
}

export function trustedRestaurantId(
  hostRestaurantId: string | null,
  injectedRestaurantId?: string | null,
): string | null {
  if (hostRestaurantId) return hostRestaurantId;
  return injectedRestaurantId ?? null;
}

export function injectionIgnored(
  hostRestaurantId: string | null,
  injectedRestaurantId?: string | null,
): boolean {
  return Boolean(
    hostRestaurantId && injectedRestaurantId && injectedRestaurantId !== hostRestaurantId,
  );
}

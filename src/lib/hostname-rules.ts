import { slugify } from "@/lib/utils";
import { restaurantSlugValidationError } from "@/lib/restaurant-slug";

export const RESTAURANT_HOSTNAME_CHANGED_PREFIX = "Restaurant hostname changed to ";

export function canonicalizeName(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function isSameEntityName(a: string, b: string): boolean {
  const left = canonicalizeName(a);
  return left.length > 0 && left === canonicalizeName(b);
}

export function hostnameInUseError(slug: string, baseDomain = ""): string {
  const host = baseDomain ? `${slug}.${baseDomain}` : `${slug}.dvadtech.in`;
  return `The hostname ${host} is already in use.`;
}

export function assertTenantName(name: string): string {
  const trimmed = String(name ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("Tenant name is required");
  return trimmed;
}

export function assertRestaurantName(name: string): string {
  const trimmed = String(name ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("Restaurant name is required");
  return trimmed;
}

export function assertUniqueRestaurantNames(names: string[]) {
  const seen = new Map<string, string>();
  for (const raw of names) {
    const name = assertRestaurantName(raw);
    const key = canonicalizeName(name);
    const previous = seen.get(key);
    if (previous) {
      throw new Error(`Restaurant name "${name}" is already used in this tenant.`);
    }
    seen.set(key, name);
  }
}

export function restaurantHostnameChangedNotice(hostname: string) {
  return `${RESTAURANT_HOSTNAME_CHANGED_PREFIX}${hostname}. Reprint/reissue QR codes that contain the old hostname.`;
}

export function tenantSlugFromName(tenantName: string): string {
  const slug = slugify(assertTenantName(tenantName));
  const error = restaurantSlugValidationError(slug);
  if (error) {
    throw new Error(`Tenant hostname is invalid: ${error}`);
  }
  return slug;
}

export function restaurantNameSlug(restaurantName: string): string {
  const slug = slugify(assertRestaurantName(restaurantName));
  if (!slug) throw new Error("Restaurant name must include letters or numbers for a hostname");
  return slug;
}

/**
 * System-managed restaurant hostname slug.
 *
 * Single restaurant with the same canonical name as the tenant → `{tenantSlug}`
 * Otherwise → `{tenantSlug}-{restaurantNameSlug}`
 */
export function plannedRestaurantHostSlug(input: {
  tenantSlug: string;
  tenantName: string;
  restaurantName: string;
  totalRestaurantCount: number;
}): string {
  const tenantSlug = input.tenantSlug.trim().toLowerCase();
  if (input.totalRestaurantCount === 1 && isSameEntityName(input.tenantName, input.restaurantName)) {
    return tenantSlug;
  }
  return `${tenantSlug}-${restaurantNameSlug(input.restaurantName)}`;
}

export function isSingleSameNameRestaurantMode(input: {
  tenantSlug: string;
  tenantName: string;
  restaurants: Array<{ name: string; slug: string }>;
}): boolean {
  if (input.restaurants.length !== 1) return false;
  const restaurant = input.restaurants[0];
  return (
    isSameEntityName(input.tenantName, restaurant.name) && restaurant.slug === input.tenantSlug
  );
}

/** Dedicated tenant hub is live only when the tenant has two or more restaurants. */
export function tenantHubIsActive(input: {
  tenantSlug?: string;
  tenantName?: string;
  restaurants: Array<{ name?: string; slug?: string }>;
}): boolean {
  return input.restaurants.length >= 2;
}

export function previewHostnames(input: {
  tenantName: string;
  restaurantNames: string[];
  tenantSlug?: string;
  baseDomain?: string;
}) {
  const tenantName = assertTenantName(input.tenantName);
  const restaurantNames = input.restaurantNames.map(assertRestaurantName);
  assertUniqueRestaurantNames(restaurantNames);
  const tenantSlug = input.tenantSlug?.trim()
    ? input.tenantSlug.trim().toLowerCase()
    : tenantSlugFromName(tenantName);
  const slugError = restaurantSlugValidationError(tenantSlug);
  if (slugError) throw new Error(slugError);

  const restaurants = restaurantNames.map((name) => ({
    name,
    slug: plannedRestaurantHostSlug({
      tenantSlug,
      tenantName,
      restaurantName: name,
      totalRestaurantCount: restaurantNames.length,
    }),
  }));
  const hubActive = tenantHubIsActive({ tenantSlug, tenantName, restaurants });
  const base = (input.baseDomain ?? "").trim().toLowerCase();
  const urlFor = (slug: string) => (base ? `https://${slug}.${base}` : slug);

  return {
    tenantSlug,
    tenantHubActive: hubActive,
    tenantUrl: hubActive ? urlFor(tenantSlug) : null,
    restaurants: restaurants.map((restaurant) => ({
      name: restaurant.name,
      slug: restaurant.slug,
      url: urlFor(restaurant.slug),
    })),
  };
}

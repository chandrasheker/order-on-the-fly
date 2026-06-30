import { prisma } from "@/lib/prisma";
import {
  ALL_FEATURE_KEYS,
  FEATURE_CATALOG,
  type FeatureDefinition,
  type FeatureKey,
} from "@/lib/feature-catalog";

/** In-memory cache — toggles apply within this window without app restart. */
const CACHE_TTL_MS = 10_000;

type CacheEntry = {
  expiresAt: number;
  flags: Record<FeatureKey, boolean>;
};

const cache = new Map<string, CacheEntry>();

function parseStoredFlags(raw: string | null | undefined): Partial<Record<FeatureKey, boolean>> {
  if (!raw || raw.trim() === "" || raw === "{}") return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    const out: Partial<Record<FeatureKey, boolean>> = {};
    for (const key of ALL_FEATURE_KEYS) {
      if (typeof parsed[key] === "boolean") {
        out[key] = parsed[key];
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function resolveFeatureFlags(
  overrides: Partial<Record<FeatureKey, boolean>> | null | undefined
): Record<FeatureKey, boolean> {
  const resolved = {} as Record<FeatureKey, boolean>;
  for (const def of FEATURE_CATALOG) {
    const override = overrides?.[def.key];
    resolved[def.key] = override ?? def.defaultEnabled;
  }
  return resolved;
}

export function invalidateFeatureCache(restaurantId?: string) {
  if (restaurantId) {
    cache.delete(restaurantId);
    return;
  }
  cache.clear();
}

export async function getRestaurantFeatureFlags(
  restaurantId: string
): Promise<Record<FeatureKey, boolean>> {
  const now = Date.now();
  const hit = cache.get(restaurantId);
  if (hit && hit.expiresAt > now) {
    return hit.flags;
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { featureFlags: true },
  });

  const overrides = parseStoredFlags(restaurant?.featureFlags);
  const flags = resolveFeatureFlags(overrides);

  cache.set(restaurantId, { flags, expiresAt: now + CACHE_TTL_MS });
  return flags;
}

export async function isFeatureEnabled(
  restaurantId: string,
  key: FeatureKey
): Promise<boolean> {
  const flags = await getRestaurantFeatureFlags(restaurantId);
  return flags[key];
}

export async function requireFeature(
  restaurantId: string,
  key: FeatureKey
): Promise<{ ok: true } | { ok: false; error: string }> {
  const enabled = await isFeatureEnabled(restaurantId, key);
  if (!enabled) {
    const def = FEATURE_CATALOG.find((f) => f.key === key);
    return {
      ok: false,
      error: `${def?.name ?? key} is not enabled for this restaurant. Contact TableTap support.`,
    };
  }
  return { ok: true };
}

export async function updateRestaurantFeatureFlags(
  restaurantId: string,
  updates: Partial<Record<FeatureKey, boolean>>
) {
  const current = await getRestaurantFeatureFlags(restaurantId);
  const stored = { ...current, ...updates };
  const payload: Partial<Record<FeatureKey, boolean>> = {};
  for (const def of FEATURE_CATALOG) {
    if (stored[def.key] !== def.defaultEnabled) {
      payload[def.key] = stored[def.key];
    }
  }

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { featureFlags: JSON.stringify(payload) },
  });

  invalidateFeatureCache(restaurantId);
  return getRestaurantFeatureFlags(restaurantId);
}

export function serializeFeaturesForClient(
  flags: Record<FeatureKey, boolean>
): Array<FeatureDefinition & { enabled: boolean }> {
  return FEATURE_CATALOG.map((def) => ({
    ...def,
    enabled: flags[def.key],
  }));
}

export async function getStaffHomePath(
  restaurantId: string,
  role: string
): Promise<string> {
  if (role === "COOK") {
    const kds = await isFeatureEnabled(restaurantId, "kds");
    return kds ? "/kitchen" : "/staff/dashboard";
  }
  return "/staff/dashboard";
}

import {
  ALL_FEATURE_KEYS,
  FEATURE_CATALOG,
  type FeatureKey,
} from "@/lib/feature-catalog";
import type { TenantPlan } from "@/generated/prisma/client";

/** Feature overrides stored on Restaurant.featureFlags (only non-default values). */
export function buildFeatureOverrides(
  mode: "expired" | "starter" | "pro" | "enterprise" | "demo",
): Partial<Record<FeatureKey, boolean>> {
  const overrides: Partial<Record<FeatureKey, boolean>> = {};

  if (mode === "expired" || mode === "starter") {
    for (const def of FEATURE_CATALOG) {
      if (def.tier === "premium" || def.tier === "roadmap") {
        overrides[def.key] = false;
      }
    }
    return overrides;
  }

  if (mode === "pro" || mode === "demo") {
    for (const def of FEATURE_CATALOG) {
      if (def.tier === "premium") {
        overrides[def.key] = true;
      }
    }
    return overrides;
  }

  // enterprise
  for (const def of FEATURE_CATALOG) {
    if (def.tier === "premium" || def.tier === "roadmap") {
      overrides[def.key] = true;
    }
  }
  return overrides;
}

export function modeForPlan(plan: TenantPlan): "starter" | "pro" | "enterprise" {
  if (plan === "ENTERPRISE") return "enterprise";
  if (plan === "PRO") return "pro";
  return "starter";
}

export function serializeFeatureOverrides(
  overrides: Partial<Record<FeatureKey, boolean>>,
): string {
  const payload: Partial<Record<FeatureKey, boolean>> = {};
  for (const key of ALL_FEATURE_KEYS) {
    const def = FEATURE_CATALOG.find((f) => f.key === key)!;
    if (overrides[key] !== undefined && overrides[key] !== def.defaultEnabled) {
      payload[key] = overrides[key];
    }
  }
  return JSON.stringify(payload);
}

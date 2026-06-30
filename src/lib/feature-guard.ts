import { NextResponse } from "next/server";
import { requireFeature } from "@/lib/feature-flags";
import type { FeatureKey } from "@/lib/feature-catalog";

export async function featureDisabledResponse(
  restaurantId: string,
  key: FeatureKey
): Promise<NextResponse | null> {
  const check = await requireFeature(restaurantId, key);
  if (!check.ok) {
    return NextResponse.json(
      { error: check.error, code: "FEATURE_DISABLED", feature: key },
      { status: 403 }
    );
  }
  return null;
}

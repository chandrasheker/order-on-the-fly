import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  getRestaurantFeatureFlags,
  serializeFeaturesForClient,
  updateRestaurantFeatureFlags,
} from "@/lib/feature-flags";
import { ALL_FEATURE_KEYS, type FeatureKey } from "@/lib/feature-catalog";
import { logApiRequest, logInfo } from "@/lib/logger";

export async function GET() {
  const admin = await requirePlatformAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  logApiRequest("platform/features", "GET");

  const restaurants = await prisma.restaurant.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, featureFlags: true },
  });

  const list = await Promise.all(
    restaurants.map(async (r) => {
      const flags = await getRestaurantFeatureFlags(r.id);
      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        features: serializeFeaturesForClient(flags),
      };
    })
  );

  return NextResponse.json({ restaurants: list });
}

export async function PATCH(req: NextRequest) {
  const admin = await requirePlatformAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  logApiRequest("platform/features", "PATCH");

  const body = await req.json();
  const restaurantId = String(body.restaurantId ?? "");
  const updates = body.updates as Record<string, boolean> | undefined;

  if (!restaurantId || !updates || typeof updates !== "object") {
    return NextResponse.json(
      { error: "restaurantId and updates object required" },
      { status: 400 }
    );
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, name: true },
  });
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  const sanitized: Partial<Record<FeatureKey, boolean>> = {};
  for (const key of ALL_FEATURE_KEYS) {
    if (typeof updates[key] === "boolean") {
      sanitized[key] = updates[key];
    }
  }

  const flags = await updateRestaurantFeatureFlags(restaurantId, sanitized);

  logInfo("platform/features", "Feature flags updated", {
    restaurantId,
    restaurantName: restaurant.name,
    adminId: admin.id,
    changed: Object.keys(sanitized),
  });

  return NextResponse.json({
    ok: true,
    message: "Features updated. Changes apply within ~10 seconds — no restart needed.",
    features: serializeFeaturesForClient(flags),
  });
}

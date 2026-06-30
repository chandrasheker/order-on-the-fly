import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  getRestaurantFeatureFlags,
  serializeFeaturesForClient,
  getStaffHomePath,
} from "@/lib/feature-flags";

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const flags = await getRestaurantFeatureFlags(session.restaurantId);
  const homePath = await getStaffHomePath(session.restaurantId, session.role);

  return NextResponse.json({
    enabled: flags,
    features: serializeFeaturesForClient(flags).filter((f) => f.enabled),
    homePath,
  });
}

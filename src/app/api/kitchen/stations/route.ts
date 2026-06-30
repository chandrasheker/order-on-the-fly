import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { canAccessKitchen } from "@/lib/staff-permissions";
import { getKitchenStations } from "@/lib/kitchen-service";
import { featureDisabledResponse } from "@/lib/feature-guard";

export async function GET() {
  const session = await requireSession();
  if (!session || !canAccessKitchen(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "kds");
  if (blocked) return blocked;

  const stations = await getKitchenStations(session.restaurantId);
  return NextResponse.json({ stations });
}

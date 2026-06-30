import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { canAccessKitchen } from "@/lib/staff-permissions";
import { getKitchenTickets } from "@/lib/kitchen-service";
import { featureDisabledResponse } from "@/lib/feature-guard";

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canAccessKitchen(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "kds");
  if (blocked) return blocked;

  const station = req.nextUrl.searchParams.get("station");
  const data = await getKitchenTickets(session.restaurantId, station);
  return NextResponse.json(data);
}

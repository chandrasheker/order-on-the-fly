import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { canAccessKitchen } from "@/lib/staff-permissions";
import { getKitchenTickets } from "@/lib/kitchen-service";
import { featureDisabledResponse } from "@/lib/feature-guard";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET(req: NextRequest) {
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

export const GET = withForensicApiRoute(handleGET);

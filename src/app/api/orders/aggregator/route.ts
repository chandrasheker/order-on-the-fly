import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { canAccessAdminMenu } from "@/lib/staff-permissions";
import { featureDisabledResponse } from "@/lib/feature-guard";
import { getAggregatorConnectionsForRestaurant } from "@/lib/aggregator-connection-service";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

/** Owner/manager: read Swiggy & Zomato connection status and webhook URLs. */
async function handleGET() {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session || !canAccessAdminMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "aggregator_inbox");
  if (blocked) return blocked;

  const connections = await getAggregatorConnectionsForRestaurant(
    session.restaurantId,
    session.restaurantSlug
  );

  return NextResponse.json({ connections });
}

export const GET = withForensicApiRoute(handleGET);

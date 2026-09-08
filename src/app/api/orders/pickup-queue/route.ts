import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { canPerformOrderAction } from "@/lib/staff-permissions";
import { getPickupQueue } from "@/lib/fulfillment/pickup-queue";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";
import { resolveTenantFromHost } from "@/platform/host-tenant";
import { hostRestaurantId, opaqueNotFoundJson } from "@/platform/tenant-scope";

async function handleGET(req: NextRequest) {
  const session = await requireSession(["OWNER", "MANAGER", "SERVER", "COOK"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canPerformOrderAction(session.role, "collect-order") && session.role !== "COOK") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const host = await resolveTenantFromHost(req);
  if (!host.ok) return opaqueNotFoundJson();
  const scoped = hostRestaurantId(host);
  if (scoped && scoped !== session.restaurantId) {
    return opaqueNotFoundJson();
  }

  const queue = await getPickupQueue(session.restaurantId);
  return NextResponse.json({ queue });
}

export const GET = withForensicApiRoute(handleGET);

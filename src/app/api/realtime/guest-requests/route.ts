import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { featureDisabledResponse } from "@/lib/feature-guard";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";
import {
  listPendingGuestRequests,
  updateGuestServiceRequest,
} from "@/lib/guest-service-request-service";

async function handleGET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "call_waiter");
  if (blocked) return blocked;

  const requests = await listPendingGuestRequests(session.restaurantId);
  return NextResponse.json({ requests });
}

export const GET = withForensicApiRoute(handleGET);

async function handlePATCH(req: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "call_waiter");
  if (blocked) return blocked;

  const body = await req.json();
  const id = String(body.id ?? "");
  const status = body.status as "ACKNOWLEDGED" | "RESOLVED";
  if (!id || !status) {
    return NextResponse.json({ error: "id and status required" }, { status: 400 });
  }

  try {
    const request = await updateGuestServiceRequest({
      restaurantId: session.restaurantId,
      id,
      status,
      userId: session.id,
      userName: session.name,
    });
    return NextResponse.json({ request });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed" },
      { status: 400 },
    );
  }
}

export const PATCH = withForensicApiRoute(handlePATCH);

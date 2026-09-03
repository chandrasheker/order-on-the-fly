import { NextRequest, NextResponse } from "next/server";
import {
  cancelGatewayAttempt,
  getGatewayAttemptPublicStatus,
} from "@/lib/gateway-payment-service";
import {
  hostRestaurantId,
  opaqueNotFoundJson,
  resolveRequestRestaurant,
} from "@/platform/tenant-scope";
import { logApiRequest } from "@/lib/logger";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ publicToken: string }> },
) {
  const { publicToken } = await params;
  logApiRequest("payments/gateway/[publicToken]", "GET");
  const resolution = await resolveRequestRestaurant(req);
  if (!resolution.ok) return opaqueNotFoundJson();

  const status = await getGatewayAttemptPublicStatus(
    publicToken,
    hostRestaurantId(resolution) ?? undefined,
  );
  if (!status) return opaqueNotFoundJson();
  return NextResponse.json({ status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ publicToken: string }> },
) {
  const { publicToken } = await params;
  const body = await req.json().catch(() => ({}));
  if (body.action !== "cancel") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  const resolution = await resolveRequestRestaurant(req);
  if (!resolution.ok) return opaqueNotFoundJson();
  const result = await cancelGatewayAttempt({
    publicToken,
    restaurantId: hostRestaurantId(resolution) ?? undefined,
  });
  if (!result.ok) return opaqueNotFoundJson();
  return NextResponse.json({ ok: true, status: result.status });
}

import { NextRequest, NextResponse } from "next/server";
import {
  cancelGatewayAttempt,
  getGatewayAttemptPublicStatus,
} from "@/lib/gateway-payment-service";
import {
  opaqueNotFoundJson,
  publicCustomerHostScope,
  resolveRequestRestaurant,
} from "@/platform/tenant-scope";
import { logApiRequest } from "@/lib/logger";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET(
  req: NextRequest,
  { params }: { params: Promise<{ publicToken: string }> },
) {
  const { publicToken } = await params;
  logApiRequest("payments/gateway/[publicToken]", "GET");
  const resolution = await resolveRequestRestaurant(req);
  const scope = publicCustomerHostScope(resolution);
  if (!scope.ok) return opaqueNotFoundJson();

  const status = await getGatewayAttemptPublicStatus(
    publicToken,
    scope.restaurantId,
    scope.requireRestaurant,
  );
  if (!status) return opaqueNotFoundJson();
  return NextResponse.json({ status });
}

async function handlePOST(
  req: NextRequest,
  { params }: { params: Promise<{ publicToken: string }> },
) {
  const { publicToken } = await params;
  const body = await req.json().catch(() => ({}));
  if (body.action !== "cancel") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  const resolution = await resolveRequestRestaurant(req);
  const scope = publicCustomerHostScope(resolution);
  if (!scope.ok) return opaqueNotFoundJson();
  const result = await cancelGatewayAttempt({
    publicToken,
    restaurantId: scope.restaurantId,
    requireRestaurant: scope.requireRestaurant,
  });
  if (!result.ok) return opaqueNotFoundJson();
  return NextResponse.json({ ok: true, status: result.status });
}

export const GET = withForensicApiRoute(handleGET);

export const POST = withForensicApiRoute(handlePOST);

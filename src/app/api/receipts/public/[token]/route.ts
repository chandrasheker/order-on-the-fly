import { NextRequest, NextResponse } from "next/server";
import { getPublicReceiptByToken } from "@/lib/public-receipt-service";
import {
  opaqueNotFoundJson,
  publicCustomerHostScope,
  resolveRequestRestaurant,
} from "@/platform/tenant-scope";
import { logApiRequest } from "@/lib/logger";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  logApiRequest("receipts/public/[token]", "GET");
  const resolution = await resolveRequestRestaurant(req);
  const scope = publicCustomerHostScope(resolution);
  if (!scope.ok) return opaqueNotFoundJson();

  const receipt = await getPublicReceiptByToken({
    token,
    hostRestaurantId: scope.restaurantId,
    requireRestaurant: scope.requireRestaurant,
  });
  if (!receipt) return opaqueNotFoundJson();
  return NextResponse.json({ receipt });
}

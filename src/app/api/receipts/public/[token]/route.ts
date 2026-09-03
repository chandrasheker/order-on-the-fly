import { NextRequest, NextResponse } from "next/server";
import { getPublicReceiptByToken } from "@/lib/public-receipt-service";
import {
  hostRestaurantId,
  opaqueNotFoundJson,
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
  if (!resolution.ok) return opaqueNotFoundJson();

  const receipt = await getPublicReceiptByToken({
    token,
    hostRestaurantId: hostRestaurantId(resolution),
  });
  if (!receipt) return opaqueNotFoundJson();
  return NextResponse.json({ receipt });
}

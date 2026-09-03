import { NextRequest, NextResponse } from "next/server";
import { verifyRazorpayCheckoutCallback } from "@/lib/gateway-payment-service";
import {
  opaqueNotFoundJson,
  publicCustomerHostScope,
  resolveRequestRestaurant,
} from "@/platform/tenant-scope";
import { logApiRequest } from "@/lib/logger";

export async function POST(req: NextRequest) {
  logApiRequest("payments/gateway/verify", "POST");
  const body = await req.json().catch(() => ({}));
  const publicToken = typeof body.publicToken === "string" ? body.publicToken : "";
  const razorpayPaymentId =
    typeof body.razorpay_payment_id === "string" ? body.razorpay_payment_id : "";
  const razorpaySignature =
    typeof body.razorpay_signature === "string" ? body.razorpay_signature : "";
  if (!publicToken || !razorpayPaymentId || !razorpaySignature) {
    return NextResponse.json({ error: "Payment details required" }, { status: 400 });
  }

  const resolution = await resolveRequestRestaurant(req);
  const scope = publicCustomerHostScope(resolution);
  if (!scope.ok) return opaqueNotFoundJson();

  const result = await verifyRazorpayCheckoutCallback({
    publicToken,
    restaurantId: scope.restaurantId,
    requireRestaurant: scope.requireRestaurant,
    razorpayPaymentId,
    razorpaySignature,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, paid: true });
}

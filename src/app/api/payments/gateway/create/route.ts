import { NextRequest, NextResponse } from "next/server";
import { assertCustomerDiningAccess } from "@/lib/customer-dining-guard";
import { createOrReuseRazorpayCheckout } from "@/lib/gateway-payment-service";
import { loadOrderByIdForRequest, opaqueNotFoundJson } from "@/platform/tenant-scope";
import { logApiRequest } from "@/lib/logger";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handlePOST(req: NextRequest) {
  logApiRequest("payments/gateway/create", "POST");
  const body = await req.json().catch(() => ({}));
  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  const tableToken = typeof body.tableToken === "string" ? body.tableToken : "";
  if (!orderId || !tableToken) {
    return NextResponse.json({ error: "Order and table session required" }, { status: 400 });
  }

  const { order, resolution } = await loadOrderByIdForRequest(req, orderId);
  if (!resolution.ok || !order) return opaqueNotFoundJson();
  if (order.table.qrToken !== tableToken) return opaqueNotFoundJson();

  const dining = await assertCustomerDiningAccess(req, tableToken);
  if (!dining.ok) {
    return NextResponse.json({ error: dining.error, code: dining.code }, { status: dining.status });
  }

  const result = await createOrReuseRazorpayCheckout({
    restaurantId: order.restaurantId,
    orderId: order.id,
    tableId: order.tableId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ checkout: result.checkout, reused: result.reused });
}

export const POST = withForensicApiRoute(handlePOST);

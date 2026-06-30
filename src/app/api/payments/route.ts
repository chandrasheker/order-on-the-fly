import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getOrderPaymentSummary } from "@/lib/payment-allocation-service";

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orderId = req.nextUrl.searchParams.get("orderId");
  if (!orderId) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }

  const summary = await getOrderPaymentSummary(orderId);
  if (!summary) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json(summary);
}

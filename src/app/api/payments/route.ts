import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getOrderPaymentSummary } from "@/lib/payment-allocation-service";
import { prisma } from "@/lib/prisma";
import { getRestaurantFeatureFlags } from "@/lib/feature-flags";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET(req: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orderId = req.nextUrl.searchParams.get("orderId");
  if (!orderId) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId: session.restaurantId },
    select: { id: true },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const flags = await getRestaurantFeatureFlags(session.restaurantId);
  if (!flags.split_bill) {
    return NextResponse.json({ error: "Split bill is not enabled" }, { status: 403 });
  }

  const summary = await getOrderPaymentSummary(orderId);
  if (!summary) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json(summary);
}

export const GET = withForensicApiRoute(handleGET);

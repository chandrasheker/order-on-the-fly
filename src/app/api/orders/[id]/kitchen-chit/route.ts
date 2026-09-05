import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { buildKitchenChitPayload } from "@/lib/kitchen-chit-service";
import { featureDisabledResponse } from "@/lib/feature-guard";
import { prisma } from "@/lib/prisma";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await requireSession(["OWNER", "MANAGER", "SERVER", "COOK"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "thermal_receipts");
  if (blocked) return blocked;

  const order = await prisma.order.findFirst({
    where: { id, restaurantId: session.restaurantId },
    select: { id: true },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const chit = await buildKitchenChitPayload(id);
  if (!chit) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({ chit });
}

export const GET = withForensicApiRoute(handleGET);

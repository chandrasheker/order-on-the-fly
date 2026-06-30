import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildReceiptPayload,
  RECEIPT_ORDER_INCLUDE,
  RECEIPT_RESTAURANT_SELECT,
} from "@/lib/receipt-service";
import { canPerformOrderAction } from "@/lib/staff-permissions";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await requireSession(["OWNER", "MANAGER", "SERVER"]);
  if (!session || !canPerformOrderAction(session.role, "mark-paid")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const order = await prisma.order.findFirst({
    where: { id, restaurantId: session.restaurantId },
    include: RECEIPT_ORDER_INCLUDE,
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (!order.paidAt) {
    return NextResponse.json({ error: "Order is not paid yet" }, { status: 400 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: session.restaurantId },
    select: RECEIPT_RESTAURANT_SELECT,
  });

  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  return NextResponse.json({
    receipt: buildReceiptPayload(restaurant, order),
  });
}

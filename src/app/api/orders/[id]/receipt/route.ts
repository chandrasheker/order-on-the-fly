import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildReceiptPayload,
  RECEIPT_ORDER_INCLUDE,
  RECEIPT_RESTAURANT_SELECT,
} from "@/lib/receipt-service";
import { receiptFromBillRow } from "@/lib/bill-service";
import { canPerformOrderAction } from "@/lib/staff-permissions";
import { featureDisabledResponse } from "@/lib/feature-guard";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await requireSession(["OWNER", "MANAGER", "SERVER"]);
  if (!session || !canPerformOrderAction(session.role, "mark-paid")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "thermal_receipts");
  if (blocked) return blocked;

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

  const bill = await prisma.bill.findFirst({
    where: { orderId: id, restaurantId: session.restaurantId, status: { not: "VOIDED" } },
  });
  if (bill) {
    const fromBill = receiptFromBillRow(bill);
    if (fromBill) return NextResponse.json({ receipt: fromBill });
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

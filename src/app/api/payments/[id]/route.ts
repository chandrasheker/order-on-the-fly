import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { paymentOwnedByRestaurant } from "@/lib/payment-scope";
import {
  confirmManualUpiPayment,
  rejectManualUpiPayment,
} from "@/lib/payment-allocation-service";
import { refundAutomaticPayment } from "@/lib/gateway-payment-service";
import { normalizeRazorpayRefundIdempotencyKey } from "@/lib/razorpay-client";
import { canPerformOrderAction } from "@/lib/staff-permissions";
import { opaqueNotFoundJson } from "@/platform/tenant-scope";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const payment = paymentOwnedByRestaurant(
    session.restaurantId,
    await prisma.payment.findFirst({
      where: { id, restaurantId: session.restaurantId },
    }),
  );
  if (!payment) return opaqueNotFoundJson();

  return NextResponse.json({
    payment: {
      id: payment.id,
      orderId: payment.orderId,
      billId: payment.billId,
      amount: payment.amount,
      method: payment.method,
      status: payment.status,
      verificationStatus: payment.verificationStatus,
      cashTendered: payment.cashTendered,
      cashChange: payment.cashChange,
      createdAt: payment.createdAt,
      capturedAt: payment.capturedAt,
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession(["OWNER", "MANAGER", "SERVER"]);
  if (!session || !canPerformOrderAction(session.role, "mark-paid")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  const owned = paymentOwnedByRestaurant(
    session.restaurantId,
    await prisma.payment.findFirst({ where: { id, restaurantId: session.restaurantId } }),
  );
  if (!owned) return opaqueNotFoundJson();

  if (action === "confirm") {
    const result = await confirmManualUpiPayment({
      paymentId: id,
      restaurantId: session.restaurantId,
      actorUserId: session.id,
      actorName: session.name,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true, payment: result.payment, summary: result.summary });
  }

  if (action === "reject") {
    const result = await rejectManualUpiPayment({
      paymentId: id,
      restaurantId: session.restaurantId,
      actorUserId: session.id,
      actorName: session.name,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true, payment: result.payment });
  }

  if (action === "refund") {
    if (session.role !== "OWNER" && session.role !== "MANAGER") {
      return NextResponse.json({ error: "Refunds require a manager" }, { status: 403 });
    }
    const isRazorpayRefund = owned.provider === "razorpay" && Boolean(owned.providerPaymentId);
    const rawRequestId =
      typeof body.requestId === "string"
        ? body.requestId
        : typeof body.refundRequestId === "string"
          ? body.refundRequestId
          : typeof body.idempotencyKey === "string"
            ? body.idempotencyKey
            : "";
    let requestId: string | undefined;
    if (isRazorpayRefund) {
      const normalized = normalizeRazorpayRefundIdempotencyKey(rawRequestId);
      if (!normalized) {
        return NextResponse.json(
          { error: rawRequestId.trim() ? "Invalid refund request id" : "Refund request id is required" },
          { status: 400 },
        );
      }
      requestId = normalized;
    }
    const result = await refundAutomaticPayment({
      paymentId: id,
      restaurantId: session.restaurantId,
      amount: typeof body.amount === "number" ? body.amount : undefined,
      requestId,
      actorUserId: session.id,
      actorName: session.name,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true, payment: result.payment });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, canManageMenu } from "@/lib/auth";
import { getPaymentQrPublicUrl, paymentQrExists, removePaymentQrFile } from "@/lib/payment-qr-storage";

export async function GET() {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: session.restaurantId },
    select: {
      slug: true,
      upiVpa: true,
      upiMerchantName: true,
      paymentGatewayProvider: true,
      paymentGatewayKeyId: true,
    },
  });

  const hasPaymentQr = await paymentQrExists(session.restaurantId);
  const paymentQrUrl =
    hasPaymentQr && restaurant?.slug ? getPaymentQrPublicUrl(restaurant.slug) : "";

  return NextResponse.json({
    settings: {
      paymentQrUrl,
      upiVpa: restaurant?.upiVpa ?? "",
      upiMerchantName: restaurant?.upiMerchantName ?? "",
      automaticUpiEnabled: Boolean(restaurant?.paymentGatewayProvider && restaurant?.paymentGatewayKeyId),
    },
  });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  if (body.paymentQrUrl === null || body.paymentQrUrl === "") {
    await removePaymentQrFile(session.restaurantId);
    await prisma.restaurant.update({
      where: { id: session.restaurantId },
      data: { paymentQrUrl: null },
    });
  }

  const data: { upiVpa?: string | null; upiMerchantName?: string | null } = {};
  if (typeof body.upiVpa === "string") {
    const vpa = body.upiVpa.trim();
    if (vpa && !/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/.test(vpa)) {
      return NextResponse.json({ error: "Enter a valid UPI ID like restaurant@upi" }, { status: 400 });
    }
    data.upiVpa = vpa || null;
  }
  if (typeof body.upiMerchantName === "string") {
    data.upiMerchantName = body.upiMerchantName.trim() || null;
  }

  if (Object.keys(data).length > 0) {
    await prisma.restaurant.update({
      where: { id: session.restaurantId },
      data,
    });
  }

  if (body.paymentQrUrl === null || body.paymentQrUrl === "" || Object.keys(data).length > 0) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.restaurantId },
      select: { slug: true, upiVpa: true, upiMerchantName: true },
    });
    const hasPaymentQr = await paymentQrExists(session.restaurantId);
    return NextResponse.json({
      settings: {
        paymentQrUrl: hasPaymentQr && restaurant?.slug ? getPaymentQrPublicUrl(restaurant.slug) : "",
        upiVpa: restaurant?.upiVpa ?? "",
        upiMerchantName: restaurant?.upiMerchantName ?? "",
      },
    });
  }

  return NextResponse.json({ error: "Use file upload to set payment QR." }, { status: 400 });
}

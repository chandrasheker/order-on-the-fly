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
    select: { slug: true },
  });

  const hasPaymentQr = await paymentQrExists(session.restaurantId);
  const paymentQrUrl =
    hasPaymentQr && restaurant?.slug ? getPaymentQrPublicUrl(restaurant.slug) : "";

  return NextResponse.json({
    settings: { paymentQrUrl },
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
    return NextResponse.json({ settings: { paymentQrUrl: "" } });
  }

  return NextResponse.json({ error: "Use file upload to set payment QR." }, { status: 400 });
}

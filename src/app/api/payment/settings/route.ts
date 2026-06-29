import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, canManageMenu } from "@/lib/auth";

export async function GET() {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: session.restaurantId },
    select: { paymentQrUrl: true },
  });

  return NextResponse.json({
    settings: { paymentQrUrl: restaurant?.paymentQrUrl ?? "" },
  });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const paymentQrUrl =
    body.paymentQrUrl === null || body.paymentQrUrl === ""
      ? null
      : String(body.paymentQrUrl).trim() || null;

  const updated = await prisma.restaurant.update({
    where: { id: session.restaurantId },
    data: { paymentQrUrl },
    select: { paymentQrUrl: true },
  });

  return NextResponse.json({ settings: updated });
}

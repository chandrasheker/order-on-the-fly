import { NextRequest, NextResponse } from "next/server";
import { requireSession, canManageMenu } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RECEIPT_RESTAURANT_SELECT } from "@/lib/receipt-service";

export async function GET() {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: session.restaurantId },
    select: {
      ...RECEIPT_RESTAURANT_SELECT,
      logoUrl: true,
    },
  });

  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  return NextResponse.json({
    settings: {
      logoUrl: restaurant.logoUrl ?? "",
      address: restaurant.receiptAddress ?? "",
      phone: restaurant.receiptPhone ?? "",
      gstin: restaurant.receiptGstin ?? "",
      gstEnabled: restaurant.receiptGstEnabled,
      gstRate: restaurant.receiptGstRate,
      footer: restaurant.receiptFooter ?? "",
    },
  });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const gstRate = body.gstRate !== undefined ? Number(body.gstRate) : undefined;

  const updated = await prisma.restaurant.update({
    where: { id: session.restaurantId },
    data: {
      ...(body.logoUrl !== undefined && {
        logoUrl: String(body.logoUrl).trim() || null,
      }),
      ...(body.address !== undefined && {
        receiptAddress: String(body.address).trim() || null,
      }),
      ...(body.phone !== undefined && {
        receiptPhone: String(body.phone).trim() || null,
      }),
      ...(body.gstin !== undefined && {
        receiptGstin: String(body.gstin).trim() || null,
      }),
      ...(body.gstEnabled !== undefined && {
        receiptGstEnabled: Boolean(body.gstEnabled),
      }),
      ...(gstRate !== undefined && {
        receiptGstRate: Number.isFinite(gstRate) ? Math.max(0, Math.min(100, gstRate)) : 5,
      }),
      ...(body.footer !== undefined && {
        receiptFooter: String(body.footer).trim() || null,
      }),
    },
    select: RECEIPT_RESTAURANT_SELECT,
  });

  return NextResponse.json({
    settings: {
      logoUrl: updated.logoUrl ?? "",
      address: updated.receiptAddress ?? "",
      phone: updated.receiptPhone ?? "",
      gstin: updated.receiptGstin ?? "",
      gstEnabled: updated.receiptGstEnabled,
      gstRate: updated.receiptGstRate,
      footer: updated.receiptFooter ?? "",
    },
  });
}

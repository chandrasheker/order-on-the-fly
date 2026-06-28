import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logApiError, logApiRequest, logWarn } from "@/lib/logger";
import { isTablePaymentBlocked } from "@/lib/payment-service";
import { getPaymentQrPublicUrl, paymentQrExists } from "@/lib/payment-qr-storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; token: string }> }
) {
  const { slug, token } = await params;
  logApiRequest("menu/[slug]/[token]", "GET", { slug, tableToken: "[present]" });

  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        rewardThresholdTea: true,
        rewardThresholdBeverage: true,
        rewardTeaLabel: true,
        rewardBeverageLabel: true,
        backgroundImageUrl: true,
        paymentQrUrl: true,
      },
    });

    if (!restaurant) {
      logWarn("menu/[slug]/[token]", "Restaurant not found", { slug });
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    const table = await prisma.table.findFirst({
      where: { qrToken: token, restaurantId: restaurant.id, isActive: true },
    });

    if (!table) {
      logWarn("menu/[slug]/[token]", "Table not found", { slug });
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    const categories = await prisma.menuCategory.findMany({
      where: { restaurantId: restaurant.id },
      include: {
        items: {
          where: { isAvailable: true },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    const paymentBlocked = await isTablePaymentBlocked(table.id);
    const hasPaymentQr = await paymentQrExists(restaurant.id);
    const paymentQrUrl = hasPaymentQr ? getPaymentQrPublicUrl(restaurant.slug) : null;

    return NextResponse.json({
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        rewardThresholdTea: restaurant.rewardThresholdTea,
        rewardThresholdBeverage: restaurant.rewardThresholdBeverage,
        rewardTeaLabel: restaurant.rewardTeaLabel,
        rewardBeverageLabel: restaurant.rewardBeverageLabel,
        backgroundImageUrl: restaurant.backgroundImageUrl,
        paymentQrUrl,
      },
      table: { id: table.id, number: table.number, qrToken: table.qrToken },
      paymentBlocked,
      categories: categories.filter((c) => c.items.length > 0),
    });
  } catch (error) {
    logApiError("menu/[slug]/[token]", "GET", error, { slug });
    return NextResponse.json({ error: "Failed to load menu" }, { status: 500 });
  }
}

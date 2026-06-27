import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { tomorrowDateString, generateRewardCode } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get("status") || "PENDING";

  const rewards = await prisma.reward.findMany({
    where: {
      restaurantId: session.restaurantId,
      ...(status !== "ALL" && { status: status as "PENDING" | "REDEEMED" }),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ rewards });
}

export async function POST(req: NextRequest) {
  try {
    const {
      tableToken,
      orderId,
      customerName,
      rewardType,
      orderTotal,
    } = await req.json();

    if (!tableToken || !customerName?.trim() || !rewardType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const table = await prisma.table.findUnique({
      where: { qrToken: tableToken },
      include: { restaurant: true },
    });

    if (!table) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    const restaurant = table.restaurant;
    const total = parseFloat(String(orderTotal || 0));

    if (rewardType === "TEA" && total < restaurant.rewardThresholdTea) {
      return NextResponse.json({ error: "Order does not qualify for tea reward" }, { status: 400 });
    }
    if (rewardType === "BEVERAGE" && total < restaurant.rewardThresholdBeverage) {
      return NextResponse.json({ error: "Order does not qualify for beverage reward" }, { status: 400 });
    }

    if (orderId) {
      const existing = await prisma.reward.findFirst({
        where: { orderId, restaurantId: restaurant.id },
      });
      if (existing) {
        return NextResponse.json({ reward: existing });
      }
    }

    const label =
      rewardType === "BEVERAGE"
        ? restaurant.rewardBeverageLabel
        : restaurant.rewardTeaLabel;

    let code = generateRewardCode();
    while (await prisma.reward.findUnique({ where: { code } })) {
      code = generateRewardCode();
    }

    const reward = await prisma.reward.create({
      data: {
        code,
        rewardType,
        rewardLabel: label,
        customerName: customerName.trim(),
        tableNumber: table.number,
        orderTotal: total,
        validDate: tomorrowDateString(),
        orderId: orderId || null,
        restaurantId: restaurant.id,
      },
    });

    return NextResponse.json({ reward }, { status: 201 });
  } catch (error) {
    console.error("Reward create error:", error);
    return NextResponse.json({ error: "Failed to create reward" }, { status: 500 });
  }
}

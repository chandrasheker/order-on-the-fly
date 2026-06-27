import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRewardTier } from "@/lib/utils";
import { logApiError, logApiRequest, logInfo } from "@/lib/logger";

const WIN_SEGMENT_INDEX = 0;
const SEGMENT_COUNT = 4;

export async function GET(req: NextRequest) {
  logApiRequest("rewards/spin", "GET");
  try {
    const orderId = req.nextUrl.searchParams.get("orderId");
    const tableToken = req.nextUrl.searchParams.get("tableToken");

    if (!orderId || !tableToken) {
      return NextResponse.json({ error: "Missing orderId or tableToken" }, { status: 400 });
    }

    const table = await prisma.table.findUnique({
      where: { qrToken: tableToken },
      include: { restaurant: true },
    });
    if (!table) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    const orderWithItems = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!orderWithItems) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const orderTotal = orderWithItems.items.reduce(
      (sum, i) => sum + i.unitPrice * i.quantity,
      0
    );

    const tier = getRewardTier(
      orderTotal,
      table.restaurant.rewardThresholdTea,
      table.restaurant.rewardThresholdBeverage
    );

    const reward = await prisma.reward.findFirst({
      where: { orderId, restaurantId: table.restaurantId },
    });

    return NextResponse.json({
      orderId,
      orderTotal,
      tier,
      eligible: tier !== "NONE",
      spun: orderWithItems.rewardSpun,
      won: Boolean(reward),
      lost: orderWithItems.rewardSpun && !reward,
      claimed: Boolean(reward),
      reward,
    });
  } catch (error) {
    logApiError("rewards/spin", "GET", error);
    return NextResponse.json({ error: "Failed to load spin status" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  logApiRequest("rewards/spin", "POST");
  try {
    const { tableToken, orderId } = await req.json();

    if (!tableToken || !orderId) {
      return NextResponse.json({ error: "Missing tableToken or orderId" }, { status: 400 });
    }

    const table = await prisma.table.findUnique({
      where: { qrToken: tableToken },
      include: { restaurant: true },
    });
    if (!table) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    const order = await prisma.order.findFirst({
      where: { id: orderId, tableId: table.id, restaurantId: table.restaurantId },
      include: { items: true },
    });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.rewardSpun) {
      const existingReward = await prisma.reward.findFirst({
        where: { orderId, restaurantId: table.restaurantId },
      });
      return NextResponse.json({
        alreadySpun: true,
        won: Boolean(existingReward),
        reward: existingReward,
      });
    }

    const orderTotal = order.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    const tier = getRewardTier(
      orderTotal,
      table.restaurant.rewardThresholdTea,
      table.restaurant.rewardThresholdBeverage
    );

    if (tier === "NONE") {
      return NextResponse.json({ error: "Order does not qualify for a reward spin" }, { status: 400 });
    }

    const prizeIdx = Math.floor(Math.random() * SEGMENT_COUNT);
    const won = prizeIdx === WIN_SEGMENT_INDEX;

    await prisma.order.update({
      where: { id: orderId },
      data: { rewardSpun: true },
    });

    logInfo("api:rewards/spin", "Spin recorded", { orderId, tier, won, prizeIdx });

    return NextResponse.json({
      won,
      tier,
      prizeIdx,
      rewardType: tier === "BEVERAGE" ? "BEVERAGE" : "TEA",
      rewardLabel:
        tier === "BEVERAGE"
          ? table.restaurant.rewardBeverageLabel
          : table.restaurant.rewardTeaLabel,
      orderTotal,
    });
  } catch (error) {
    logApiError("rewards/spin", "POST", error);
    return NextResponse.json({ error: "Failed to process spin" }, { status: 500 });
  }
}

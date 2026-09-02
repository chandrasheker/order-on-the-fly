import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRewardTier, sumBillableTotal } from "@/lib/utils";
import { logApiError, logApiRequest, logInfo } from "@/lib/logger";
import { loadOrderByIdForRequest, loadTableByQrForRequest, opaqueNotFoundJson } from "@/platform/tenant-scope";

const WIN_SEGMENT_INDEX = 0;

export async function GET(req: NextRequest) {
  logApiRequest("rewards/spin", "GET");
  try {
    const orderId = req.nextUrl.searchParams.get("orderId");
    const tableToken = req.nextUrl.searchParams.get("tableToken");

    if (!orderId || !tableToken) {
      return NextResponse.json({ error: "Missing orderId or tableToken" }, { status: 400 });
    }

    const { table, resolution } = await loadTableByQrForRequest(req, tableToken);
    if (!resolution.ok || !table) {
      return opaqueNotFoundJson();
    }

    const { order: orderWithItems } = await loadOrderByIdForRequest(req, orderId);
    if (!orderWithItems || orderWithItems.tableId !== table.id) {
      return opaqueNotFoundJson();
    }

    const orderTotal = sumBillableTotal(orderWithItems.items);

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

    const { table, resolution } = await loadTableByQrForRequest(req, tableToken);
    if (!resolution.ok || !table) {
      return opaqueNotFoundJson();
    }

    const { order } = await loadOrderByIdForRequest(req, orderId);
    if (!order || order.tableId !== table.id || order.restaurantId !== table.restaurantId) {
      return opaqueNotFoundJson();
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

    const orderTotal = sumBillableTotal(order.items);
    const tier = getRewardTier(
      orderTotal,
      table.restaurant.rewardThresholdTea,
      table.restaurant.rewardThresholdBeverage
    );

    if (tier === "NONE") {
      return NextResponse.json({ error: "Order does not qualify for a reward spin" }, { status: 400 });
    }

    // Qualifying orders always win their tier reward — the wheel is for show.
    const prizeIdx = WIN_SEGMENT_INDEX;
    const won = true;

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

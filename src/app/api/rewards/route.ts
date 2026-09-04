import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { generateRewardCode, getRewardTier } from "@/lib/utils";
import {
  expireStaleRewards,
  formatRewardExpiry,
  rewardExpiresAt,
} from "@/lib/reward-service";
import { logApiError, logApiRequest, logInfo } from "@/lib/logger";
import { format } from "date-fns";
import { loadTableByQrForRequest, opaqueNotFoundJson } from "@/platform/tenant-scope";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET(req: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await expireStaleRewards(session.restaurantId);

  const status = req.nextUrl.searchParams.get("status") || "PENDING";

  const rewards = await prisma.reward.findMany({
    where: {
      restaurantId: session.restaurantId,
      ...(status !== "ALL" && {
        status: status as "PENDING" | "REDEEMED" | "EXPIRED",
      }),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ rewards });
}

export const GET = withForensicApiRoute(handleGET);

async function handlePOST(req: NextRequest) {
  logApiRequest("rewards", "POST");
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

    const { table, resolution } = await loadTableByQrForRequest(req, tableToken);
    if (!resolution.ok || !table) {
      return opaqueNotFoundJson();
    }

    const restaurant = table.restaurant;
    const total = parseFloat(String(orderTotal || 0));
    const tier = getRewardTier(
      total,
      restaurant.rewardThresholdTea,
      restaurant.rewardThresholdBeverage
    );

    if (tier === "NONE") {
      return NextResponse.json(
        { error: "Order does not qualify for a reward" },
        { status: 400 }
      );
    }

    if (rewardType !== tier) {
      return NextResponse.json(
        {
          error:
            tier === "BEVERAGE"
              ? "Order qualifies for beverage reward, not tea"
              : "Order qualifies for tea reward only",
        },
        { status: 400 }
      );
    }

    if (orderId) {
      const order = await prisma.order.findFirst({
        where: { id: orderId, tableId: table.id, restaurantId: restaurant.id },
      });
      if (!order?.rewardSpun) {
        return NextResponse.json(
          { error: "Spin the wheel before claiming a reward" },
          { status: 400 }
        );
      }

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

    const expiresAt = rewardExpiresAt();

    const reward = await prisma.reward.create({
      data: {
        code,
        rewardType,
        rewardLabel: label,
        customerName: customerName.trim(),
        tableNumber: table.number,
        orderTotal: total,
        validDate: format(expiresAt, "yyyy-MM-dd HH:mm"),
        expiresAt,
        orderId: orderId || null,
        restaurantId: restaurant.id,
      },
    });

    logInfo("api:rewards", "Reward created", {
      rewardId: reward.id,
      code: reward.code,
      rewardType: reward.rewardType,
      tableNumber: reward.tableNumber,
      expiresAt: reward.expiresAt,
    });

    return NextResponse.json(
      {
        reward: {
          ...reward,
          expiresAtFormatted: formatRewardExpiry(reward.expiresAt),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logApiError("rewards", "POST", error);
    return NextResponse.json({ error: "Failed to create reward" }, { status: 500 });
  }
}

export const POST = withForensicApiRoute(handlePOST);

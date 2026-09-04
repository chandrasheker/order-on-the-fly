import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, canManageMenu } from "@/lib/auth";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: session.restaurantId },
    select: {
      rewardThresholdTea: true,
      rewardThresholdBeverage: true,
      rewardTeaLabel: true,
      rewardBeverageLabel: true,
    },
  });

  return NextResponse.json({ settings: restaurant });
}

export const GET = withForensicApiRoute(handleGET);

async function handlePATCH(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const updated = await prisma.restaurant.update({
    where: { id: session.restaurantId },
    data: {
      ...(body.rewardThresholdTea !== undefined && {
        rewardThresholdTea: parseFloat(String(body.rewardThresholdTea)),
      }),
      ...(body.rewardThresholdBeverage !== undefined && {
        rewardThresholdBeverage: parseFloat(String(body.rewardThresholdBeverage)),
      }),
      ...(body.rewardTeaLabel !== undefined && { rewardTeaLabel: body.rewardTeaLabel }),
      ...(body.rewardBeverageLabel !== undefined && {
        rewardBeverageLabel: body.rewardBeverageLabel,
      }),
    },
    select: {
      rewardThresholdTea: true,
      rewardThresholdBeverage: true,
      rewardTeaLabel: true,
      rewardBeverageLabel: true,
    },
  });

  return NextResponse.json({ settings: updated });
}

export const PATCH = withForensicApiRoute(handlePATCH);

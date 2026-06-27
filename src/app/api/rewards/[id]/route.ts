import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, canManageMenu } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { action } = await req.json();

  const reward = await prisma.reward.findFirst({
    where: { id, restaurantId: session.restaurantId },
  });

  if (!reward) {
    return NextResponse.json({ error: "Reward not found" }, { status: 404 });
  }

  if (action === "redeem") {
    const updated = await prisma.reward.update({
      where: { id },
      data: { status: "REDEEMED", redeemedAt: new Date() },
    });
    return NextResponse.json({ reward: updated });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

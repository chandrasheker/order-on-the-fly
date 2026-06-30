import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { canPlaceOfflineOrder } from "@/lib/staff-permissions";
import { prisma } from "@/lib/prisma";
import { featureDisabledResponse } from "@/lib/feature-guard";

export async function GET() {
  const session = await requireSession(["OWNER", "MANAGER", "SERVER"]);
  if (!session || !canPlaceOfflineOrder(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "phone_orders");
  if (blocked) return blocked;

  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId: session.restaurantId },
    include: {
      items: {
        where: { isAvailable: true },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({
    categories: categories.filter((category) => category.items.length > 0),
  });
}

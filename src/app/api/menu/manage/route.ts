import { NextRequest, NextResponse } from "next/server";
import { requireSession, canManageMenu } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId: session.restaurantId },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({ categories });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itemId, isAvailable, prepTimeMinutes, price } = await req.json();

  if (!itemId) {
    return NextResponse.json({ error: "Item ID required" }, { status: 400 });
  }

  const item = await prisma.menuItem.findFirst({
    where: { id: itemId, category: { restaurantId: session.restaurantId } },
  });

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const updated = await prisma.menuItem.update({
    where: { id: itemId },
    data: {
      ...(isAvailable !== undefined && { isAvailable }),
      ...(prepTimeMinutes !== undefined && { prepTimeMinutes }),
      ...(price !== undefined && { price }),
    },
  });

  return NextResponse.json({ item: updated });
}

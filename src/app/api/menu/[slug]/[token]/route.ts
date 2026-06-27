import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; token: string }> }
) {
  const { slug, token } = await params;

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
  });

  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  const table = await prisma.table.findFirst({
    where: { qrToken: token, restaurantId: restaurant.id, isActive: true },
  });

  if (!table) {
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

  return NextResponse.json({
    restaurant: { id: restaurant.id, name: restaurant.name, slug: restaurant.slug },
    table: { id: table.id, number: table.number, qrToken: table.qrToken },
    categories,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { requireSession, canManageMenu } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scheduleMenuSync, syncMenuItemAvailability } from "@/lib/aggregator-sync-service";

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

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, price, categoryId, prepTimeMinutes } = await req.json();

  if (!name?.trim() || !categoryId || price === undefined || price === null) {
    return NextResponse.json(
      { error: "Name, category, and price are required" },
      { status: 400 }
    );
  }

  const category = await prisma.menuCategory.findFirst({
    where: { id: categoryId, restaurantId: session.restaurantId },
  });

  if (!category) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  const parsedPrice = parseFloat(String(price));
  if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
    return NextResponse.json({ error: "Invalid price" }, { status: 400 });
  }

  if (category.slug === "todays-special") {
    await prisma.menuItem.updateMany({
      where: { categoryId: category.id },
      data: { isAvailable: false },
    });
  }

  const maxSort = await prisma.menuItem.aggregate({
    where: { categoryId: category.id },
    _max: { sortOrder: true },
  });

  const item = await prisma.menuItem.create({
    data: {
      name: name.trim(),
      price: parsedPrice,
      categoryId: category.id,
      prepTimeMinutes: prepTimeMinutes ?? 10,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      isAvailable: true,
    },
  });

  scheduleMenuSync(session.restaurantId);

  return NextResponse.json({ item }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itemId, isAvailable, prepTimeMinutes, price, name, swiggyItemId, zomatoItemId } =
    await req.json();

  if (!itemId) {
    return NextResponse.json({ error: "Item ID required" }, { status: 400 });
  }

  const item = await prisma.menuItem.findFirst({
    where: { id: itemId, category: { restaurantId: session.restaurantId } },
    include: { category: true },
  });

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  if (isAvailable === true && item.category.slug === "todays-special") {
    await prisma.menuItem.updateMany({
      where: {
        categoryId: item.categoryId,
        id: { not: itemId },
      },
      data: { isAvailable: false },
    });
  }

  const updated = await prisma.menuItem.update({
    where: { id: itemId },
    data: {
      ...(isAvailable !== undefined && { isAvailable }),
      ...(prepTimeMinutes !== undefined && { prepTimeMinutes }),
      ...(price !== undefined && { price: parseFloat(String(price)) }),
      ...(name !== undefined && { name: name.trim() }),
      ...(swiggyItemId !== undefined && {
        swiggyItemId: swiggyItemId ? String(swiggyItemId).trim() : null,
      }),
      ...(zomatoItemId !== undefined && {
        zomatoItemId: zomatoItemId ? String(zomatoItemId).trim() : null,
      }),
    },
  });

  if (isAvailable !== undefined) {
    void syncMenuItemAvailability(session.restaurantId, itemId, Boolean(isAvailable));
  }
  scheduleMenuSync(session.restaurantId);

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itemId } = await req.json();
  if (!itemId) {
    return NextResponse.json({ error: "Item ID required" }, { status: 400 });
  }

  const item = await prisma.menuItem.findFirst({
    where: { id: itemId, category: { restaurantId: session.restaurantId } },
  });

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  await prisma.menuItem.delete({ where: { id: itemId } });
  scheduleMenuSync(session.restaurantId);
  return NextResponse.json({ success: true });
}

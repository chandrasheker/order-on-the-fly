import { NextRequest, NextResponse } from "next/server";
import { requireSession, canManageMenu } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureStarterMenuCategories, updateManagedMenuItemForRestaurant } from "@/lib/menu-setup-service";
import { scheduleMenuSync, syncMenuItemAvailability } from "@/lib/aggregator-sync-service";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/platform/forensics/constants";
import { appendPlatformAuditEventInTx } from "@/platform/forensics/platform-audit-service";
import { auditMenuItemSnapshot } from "@/platform/forensics/snapshots";
import { setForensicResource } from "@/platform/forensics/request-context";
import { deleteManagedMenuMediaBestEffort } from "@/lib/menu-media/service";
import { omitMenuItemStorageKey } from "@/lib/menu-media/keys";

async function handleGET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureStarterMenuCategories(session.restaurantId);

  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId: session.restaurantId },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({
    categories: categories.map((category) => ({
      ...category,
      items: category.items.map((item) => omitMenuItemStorageKey(item)),
    })),
  });
}

export const GET = withForensicApiRoute(handleGET);

async function handlePOST(req: NextRequest) {
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

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.menuItem.create({
      data: {
        name: name.trim(),
        price: parsedPrice,
        categoryId: category.id,
        prepTimeMinutes: prepTimeMinutes ?? 10,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        isAvailable: true,
      },
    });
    setForensicResource({ type: "MenuItem", id: created.id, label: created.name });
    await appendPlatformAuditEventInTx(tx, {
      category: AUDIT_CATEGORY.MENU,
      action: AUDIT_ACTION.MENU_ITEM_CREATED,
      restaurantId: session.restaurantId,
      resourceType: "MenuItem",
      resourceId: created.id,
      resourceLabel: created.name,
      after: auditMenuItemSnapshot(created),
    });
    return created;
  });

  scheduleMenuSync(session.restaurantId);

  return NextResponse.json({ item }, { status: 201 });
}

export const POST = withForensicApiRoute(handlePOST);

async function handlePATCH(req: NextRequest) {
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

  const nextPrice = price !== undefined ? parseFloat(String(price)) : undefined;
  const updated = await updateManagedMenuItemForRestaurant({
    restaurantId: session.restaurantId,
    item,
    nextPrice,
    isAvailable,
    prepTimeMinutes,
    name,
    swiggyItemId,
    zomatoItemId,
  });

  if (isAvailable !== undefined) {
    void syncMenuItemAvailability(session.restaurantId, itemId, Boolean(isAvailable));
  }
  scheduleMenuSync(session.restaurantId);

  return NextResponse.json({ item: updated });
}

export const PATCH = withForensicApiRoute(handlePATCH);

async function handleDELETE(req: NextRequest) {
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

  const storageKey = item.imageStorageKey;
  await prisma.$transaction(async (tx) => {
    const snapshot = auditMenuItemSnapshot(item);
    await appendPlatformAuditEventInTx(tx, {
      category: AUDIT_CATEGORY.MENU,
      action: AUDIT_ACTION.MENU_ITEM_DELETED,
      restaurantId: session.restaurantId,
      resourceType: "MenuItem",
      resourceId: item.id,
      resourceLabel: item.name,
      before: snapshot,
    });
    await tx.menuItem.delete({ where: { id: itemId } });
  });
  await deleteManagedMenuMediaBestEffort(storageKey);
  scheduleMenuSync(session.restaurantId);
  return NextResponse.json({ success: true });
}

export const DELETE = withForensicApiRoute(handleDELETE);

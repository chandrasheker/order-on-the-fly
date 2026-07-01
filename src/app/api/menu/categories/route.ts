import { NextRequest, NextResponse } from "next/server";
import { requireSession, canManageMenu } from "@/lib/auth";
import {
  addPresetCategories,
  createMenuCategory,
  deleteMenuCategory,
  ensureStarterMenuCategories,
  MENU_CATEGORY_PRESETS,
  updateMenuCategory,
} from "@/lib/menu-setup-service";
import { scheduleMenuSync } from "@/lib/aggregator-sync-service";

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureStarterMenuCategories(session.restaurantId);

  return NextResponse.json({
    presets: MENU_CATEGORY_PRESETS,
  });
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const action = String(body.action ?? "create");

  try {
    if (action === "bootstrap") {
      const created = await ensureStarterMenuCategories(session.restaurantId);
      scheduleMenuSync(session.restaurantId);
      return NextResponse.json({ ok: true, created });
    }

    if (action === "presets") {
      const slugs = Array.isArray(body.slugs) ? body.slugs.map(String) : [];
      const categories = await addPresetCategories(session.restaurantId, slugs);
      scheduleMenuSync(session.restaurantId);
      return NextResponse.json({ categories }, { status: 201 });
    }

    const category = await createMenuCategory(session.restaurantId, {
      name: String(body.name ?? ""),
      icon: body.icon != null ? String(body.icon) : null,
    });
    scheduleMenuSync(session.restaurantId);
    return NextResponse.json({ category }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create category";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const categoryId = String(body.categoryId ?? "");
  if (!categoryId) {
    return NextResponse.json({ error: "categoryId required" }, { status: 400 });
  }

  try {
    const category = await updateMenuCategory(session.restaurantId, categoryId, {
      name: body.name != null ? String(body.name) : undefined,
      icon: body.icon !== undefined ? (body.icon == null ? null : String(body.icon)) : undefined,
      isEnabled: body.isEnabled !== undefined ? Boolean(body.isEnabled) : undefined,
    });
    scheduleMenuSync(session.restaurantId);
    return NextResponse.json({ category });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update category";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const categoryId = String(body.categoryId ?? "");
  if (!categoryId) {
    return NextResponse.json({ error: "categoryId required" }, { status: 400 });
  }

  try {
    await deleteMenuCategory(session.restaurantId, categoryId);
    scheduleMenuSync(session.restaurantId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not delete category";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

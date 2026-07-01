import { NextRequest, NextResponse } from "next/server";
import { requireSession, canManageMenu } from "@/lib/auth";
import { featureDisabledResponse } from "@/lib/feature-guard";
import { listModifierGroups, upsertModifierGroup } from "@/lib/modifier-service";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "menu_modifiers");
  if (blocked) return blocked;

  const groups = await listModifierGroups(session.restaurantId);
  return NextResponse.json({ groups });
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "menu_modifiers");
  if (blocked) return blocked;

  const body = await req.json();
  try {
    const group = await upsertModifierGroup(session.restaurantId, {
      id: body.id,
      name: String(body.name ?? ""),
      required: Boolean(body.required),
      minSelect: Number(body.minSelect ?? 0),
      maxSelect: Number(body.maxSelect ?? 1),
      options: (body.options ?? []).map((o: { name: string; priceDelta?: number; isDefault?: boolean }) => ({
        name: o.name,
        priceDelta: Number(o.priceDelta ?? 0),
        isDefault: Boolean(o.isDefault),
      })),
      menuItemIds: body.menuItemIds ?? undefined,
    });
    return NextResponse.json({ group });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Save failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "menu_modifiers");
  if (blocked) return blocked;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.modifierGroup.deleteMany({ where: { id, restaurantId: session.restaurantId } });
  return NextResponse.json({ ok: true });
}

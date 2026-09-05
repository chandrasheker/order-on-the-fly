import { NextRequest, NextResponse } from "next/server";
import { requireSession, canManageMenu } from "@/lib/auth";
import { featureDisabledResponse } from "@/lib/feature-guard";
import { listComboMeals, upsertComboMeal } from "@/lib/promotion-service";
import { prisma } from "@/lib/prisma";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET() {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "promotions_engine");
  if (blocked) return blocked;

  const combos = await listComboMeals(session.restaurantId);
  return NextResponse.json({ combos });
}

export const GET = withForensicApiRoute(handleGET);

async function handlePOST(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "promotions_engine");
  if (blocked) return blocked;

  const body = await req.json();
  try {
    const combo = await upsertComboMeal(session.restaurantId, {
      id: body.id,
      name: String(body.name ?? ""),
      description: body.description ?? null,
      comboPrice: Number(body.comboPrice ?? 0),
      isAvailable: body.isAvailable !== undefined ? Boolean(body.isAvailable) : true,
      items: (body.items ?? []).map((i: { menuItemId: string; quantity: number }) => ({
        menuItemId: i.menuItemId,
        quantity: Number(i.quantity ?? 1),
      })),
    });
    return NextResponse.json({ combo });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Save failed" },
      { status: 400 },
    );
  }
}

export const POST = withForensicApiRoute(handlePOST);

async function handleDELETE(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "promotions_engine");
  if (blocked) return blocked;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.comboMeal.deleteMany({ where: { id, restaurantId: session.restaurantId } });
  return NextResponse.json({ ok: true });
}

export const DELETE = withForensicApiRoute(handleDELETE);

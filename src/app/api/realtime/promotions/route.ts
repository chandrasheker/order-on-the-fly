import { NextRequest, NextResponse } from "next/server";
import { requireSession, canManageMenu } from "@/lib/auth";
import { featureDisabledResponse } from "@/lib/feature-guard";
import { listPromotions, upsertPromotion } from "@/lib/promotion-service";
import type { PromotionType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET() {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "promotions_engine");
  if (blocked) return blocked;

  const promotions = await listPromotions(session.restaurantId);
  return NextResponse.json({ promotions });
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
    const promotion = await upsertPromotion(session.restaurantId, {
      id: body.id,
      name: String(body.name ?? ""),
      type: body.type as PromotionType,
      value: Number(body.value ?? 0),
      code: body.code ?? null,
      categorySlug: body.categorySlug ?? null,
      menuItemId: body.menuItemId ?? null,
      comboMealId: body.comboMealId ?? null,
      minOrderAmount: Number(body.minOrderAmount ?? 0),
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      daysOfWeek: body.daysOfWeek ?? null,
      startHour: body.startHour ?? null,
      endHour: body.endHour ?? null,
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
    });
    return NextResponse.json({ promotion });
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

  await prisma.promotion.deleteMany({ where: { id, restaurantId: session.restaurantId } });
  return NextResponse.json({ ok: true });
}

export const DELETE = withForensicApiRoute(handleDELETE);

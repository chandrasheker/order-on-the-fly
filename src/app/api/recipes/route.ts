import { NextRequest, NextResponse } from "next/server";
import { requireSession, canManageMenu } from "@/lib/auth";
import { featureDisabledResponse } from "@/lib/feature-guard";
import { listIngredients, upsertIngredient, upsertRecipeLine, getRecipeForMenuItem } from "@/lib/recipe-service";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "inventory_86");
  if (blocked) return blocked;

  const menuItemId = req.nextUrl.searchParams.get("menuItemId");
  if (menuItemId) {
    const recipe = await getRecipeForMenuItem(menuItemId);
    return NextResponse.json({ recipe });
  }

  const ingredients = await listIngredients(session.restaurantId);
  return NextResponse.json({ ingredients });
}

export const GET = withForensicApiRoute(handleGET);

async function handlePOST(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "inventory_86");
  if (blocked) return blocked;

  const body = await req.json();

  if (body.menuItemId && body.ingredientId) {
    const line = await upsertRecipeLine({
      restaurantId: session.restaurantId,
      menuItemId: body.menuItemId,
      ingredientId: body.ingredientId,
      quantity: Number(body.quantity ?? 0),
    });
    return NextResponse.json({ recipeLine: line });
  }

  const ingredient = await upsertIngredient(session.restaurantId, {
    id: body.id,
    name: body.name,
    unit: body.unit,
    stockQuantity: body.stockQuantity,
    lowStockThreshold: body.lowStockThreshold,
  });

  return NextResponse.json({ ingredient });
}

export const POST = withForensicApiRoute(handlePOST);

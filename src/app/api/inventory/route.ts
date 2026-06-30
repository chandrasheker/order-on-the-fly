import { NextRequest, NextResponse } from "next/server";
import { requireSession, canManageMenu } from "@/lib/auth";
import { featureDisabledResponse } from "@/lib/feature-guard";
import { listInventoryItems, adjustMenuItemStock } from "@/lib/inventory-service";

export async function GET() {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "inventory_86");
  if (blocked) return blocked;

  const items = await listInventoryItems(session.restaurantId);
  return NextResponse.json({ items });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "inventory_86");
  if (blocked) return blocked;

  const body = await req.json();
  const itemId = String(body.itemId ?? "");
  if (!itemId) {
    return NextResponse.json({ error: "itemId required" }, { status: 400 });
  }

  try {
    const item = await adjustMenuItemStock({
      restaurantId: session.restaurantId,
      itemId,
      stockQuantity: Number(body.stockQuantity ?? 0),
      trackInventory: body.trackInventory !== undefined ? Boolean(body.trackInventory) : undefined,
      actorUserId: session.id,
      actorName: session.name,
    });
    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed" },
      { status: 400 }
    );
  }
}

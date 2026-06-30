import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { canAccessFloorPlan, canManageFloorLayout } from "@/lib/staff-permissions";
import { getFloorSnapshot, updateTableFloor } from "@/lib/floor-service";

export async function GET() {
  const session = await requireSession();
  if (!session || !canAccessFloorPlan(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await getFloorSnapshot(session.restaurantId);
  return NextResponse.json(snapshot);
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canAccessFloorPlan(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { tableId } = body;
  if (!tableId) {
    return NextResponse.json({ error: "tableId required" }, { status: 400 });
  }

  if (
    (body.positionX !== undefined ||
      body.positionY !== undefined ||
      body.width !== undefined ||
      body.height !== undefined) &&
    !canManageFloorLayout(session.role)
  ) {
    return NextResponse.json({ error: "Only managers can edit layout" }, { status: 403 });
  }

  const updated = await updateTableFloor(session.restaurantId, tableId, {
    positionX: body.positionX,
    positionY: body.positionY,
    width: body.width,
    height: body.height,
    section: body.section,
    assignedServerId: body.assignedServerId,
    guestCount: body.guestCount,
    seated: body.seated,
    clear: body.clear,
  });

  if (!updated) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  return NextResponse.json({ table: updated });
}

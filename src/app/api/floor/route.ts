import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { canAccessFloorPlan, canManageFloorLayout } from "@/lib/staff-permissions";
import { getFloorSnapshot, updateTableFloor } from "@/lib/floor-service";
import { featureDisabledResponse } from "@/lib/feature-guard";
import { logApiError } from "@/lib/logger";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET() {
  const session = await requireSession();
  if (!session || !canAccessFloorPlan(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "floor_plan");
  if (blocked) return blocked;

  try {
    const snapshot = await getFloorSnapshot(session.restaurantId);
    return NextResponse.json(snapshot);
  } catch (error) {
    logApiError("floor", "GET", error);
    return NextResponse.json(
      {
        error:
          "Floor plan data could not be loaded. Run npm run db:setup if this is a fresh install.",
      },
      { status: 500 },
    );
  }
}

export const GET = withForensicApiRoute(handleGET);

async function handlePATCH(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canAccessFloorPlan(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "floor_plan");
  if (blocked) return blocked;

  const body = await req.json();
  const { tableId } = body;
  if (!tableId || typeof tableId !== "string") {
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

  const result = await updateTableFloor(session.restaurantId, tableId, {
    positionX: body.positionX,
    positionY: body.positionY,
    width: body.width,
    height: body.height,
    section: body.section,
    ...(Object.prototype.hasOwnProperty.call(body, "assignedServerId")
      ? { assignedServerId: body.assignedServerId as string | null }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(body, "guestCount")
      ? { guestCount: body.guestCount as number | null }
      : {}),
    seated: body.seated,
    clear: body.clear,
  });

  if ("error" in result && result.error) {
    const status = result.error.includes("unpaid") ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ table: result.table });
}

export const PATCH = withForensicApiRoute(handlePATCH);

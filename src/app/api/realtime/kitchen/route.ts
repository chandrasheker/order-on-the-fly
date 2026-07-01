import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { featureDisabledResponse } from "@/lib/feature-guard";
import { getKitchenCapacityState, setKitchenPaused } from "@/lib/kitchen-capacity-service";

export async function GET() {
  const session = await requireSession(["OWNER", "MANAGER", "COOK"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "kitchen_capacity");
  if (blocked) return blocked;

  const state = await getKitchenCapacityState(session.restaurantId);
  return NextResponse.json({ state });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "kitchen_capacity");
  if (blocked) return blocked;

  const body = await req.json();
  const updated = await setKitchenPaused({
    restaurantId: session.restaurantId,
    paused: Boolean(body.paused),
    message: body.message ?? null,
    autoPauseOverdueThreshold:
      body.autoPauseOverdueThreshold !== undefined
        ? Number(body.autoPauseOverdueThreshold)
        : undefined,
  });
  return NextResponse.json({ state: updated });
}

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { featureDisabledResponse } from "@/lib/feature-guard";
import { clockIn, clockOut, getLaborDashboard } from "@/lib/labor-service";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET(req: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "labor_clock");
  if (blocked) return blocked;

  const date = req.nextUrl.searchParams.get("date") ?? undefined;
  const dashboard = await getLaborDashboard(session.restaurantId, date ?? undefined);
  return NextResponse.json(dashboard);
}

export const GET = withForensicApiRoute(handleGET);

async function handlePOST(req: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "labor_clock");
  if (blocked) return blocked;

  const { action } = await req.json();
  try {
    if (action === "clock-in") {
      const shift = await clockIn(session.restaurantId, session.id);
      return NextResponse.json({ ok: true, shift });
    }
    if (action === "clock-out") {
      const shift = await clockOut(session.restaurantId, session.id);
      return NextResponse.json({ ok: true, shift });
    }
    return NextResponse.json({ error: "action must be clock-in or clock-out" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Labor action failed" },
      { status: 400 }
    );
  }
}

export const POST = withForensicApiRoute(handlePOST);

import { NextResponse } from "next/server";
import { requireSession, canManageMenu } from "@/lib/auth";
import { generateDemandForecasts, listForecasts, getForecastInsights } from "@/lib/forecast-service";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET(req: Request) {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? undefined;

  const [forecasts, insights] = await Promise.all([
    listForecasts(session.restaurantId, date),
    getForecastInsights(session.restaurantId),
  ]);

  return NextResponse.json({ forecasts, insights });
}

export const GET = withForensicApiRoute(handleGET);

async function handlePOST() {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const count = await generateDemandForecasts(session.restaurantId);
  return NextResponse.json({ ok: true, forecastsUpdated: count });
}

export const POST = withForensicApiRoute(handlePOST);

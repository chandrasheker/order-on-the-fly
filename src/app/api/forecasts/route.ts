import { NextResponse } from "next/server";
import { requireSession, canManageMenu } from "@/lib/auth";
import { generateDemandForecasts, listForecasts, getForecastInsights } from "@/lib/forecast-service";

export async function GET(req: Request) {
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

export async function POST() {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const count = await generateDemandForecasts(session.restaurantId);
  return NextResponse.json({ ok: true, forecastsUpdated: count });
}

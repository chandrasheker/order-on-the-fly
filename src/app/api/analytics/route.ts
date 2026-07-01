import { NextResponse } from "next/server";
import { requireSession, canManageMenu } from "@/lib/auth";
import { getAnalyticsSummary, listRecentEvents } from "@/lib/analytics-service";

export async function GET(req: Request) {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? undefined;

  const [summary, events] = await Promise.all([
    getAnalyticsSummary(session.restaurantId, date),
    listRecentEvents(session.restaurantId, 30),
  ]);

  return NextResponse.json({ summary, events });
}

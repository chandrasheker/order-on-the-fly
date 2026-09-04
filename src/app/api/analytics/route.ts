import { NextResponse } from "next/server";
import { requireSession, canManageMenu } from "@/lib/auth";
import { getAnalyticsSummary, listRecentEvents } from "@/lib/analytics-service";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET(req: Request) {
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

export const GET = withForensicApiRoute(handleGET);

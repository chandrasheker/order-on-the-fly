import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { canAccessReports } from "@/lib/staff-permissions";
import {
  getStaffPerformanceReport,
  getTableServiceLog,
} from "@/lib/staff-performance-service";
import { todayDateString } from "@/lib/utils";
import { featureDisabledResponse } from "@/lib/feature-guard";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET(req: NextRequest) {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session || !canAccessReports(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "staff_performance");
  if (blocked) return blocked;

  const date = req.nextUrl.searchParams.get("date") || todayDateString();
  const includeTables = req.nextUrl.searchParams.get("tables") === "1";

  const performance = await getStaffPerformanceReport(session.restaurantId, date);
  const tableLog = includeTables
    ? await getTableServiceLog(session.restaurantId, date)
    : undefined;

  return NextResponse.json({
    ...performance,
    tableLog,
  });
}

export const GET = withForensicApiRoute(handleGET);

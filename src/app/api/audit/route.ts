import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { canAccessAdminMenu } from "@/lib/staff-permissions";
import { featureDisabledResponse } from "@/lib/feature-guard";
import { listAuditLogs } from "@/lib/audit-service";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canAccessAdminMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "audit_log");
  if (blocked) return blocked;

  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "100", 10);
  const logs = await listAuditLogs(session.restaurantId, limit);
  return NextResponse.json({
    logs: logs.map((l) => ({
      ...l,
      createdAt: l.createdAt.toISOString(),
      approvedAt: l.approvedAt?.toISOString() ?? null,
    })),
  });
}

export const GET = withForensicApiRoute(handleGET);

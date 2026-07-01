import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth";
import { listLoginAuditLogs } from "@/lib/login-audit-service";

export async function GET(req: NextRequest) {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = req.nextUrl.searchParams.get("tenantId") ?? undefined;
  const restaurantId = req.nextUrl.searchParams.get("restaurantId") ?? undefined;
  const kind = req.nextUrl.searchParams.get("kind") as "STAFF" | "PLATFORM_ADMIN" | null;
  const limit = req.nextUrl.searchParams.get("limit")
    ? Number(req.nextUrl.searchParams.get("limit"))
    : 100;

  const logs = await listLoginAuditLogs({
    tenantId,
    restaurantId,
    kind: kind ?? undefined,
    limit,
  });

  return NextResponse.json({ logs });
}

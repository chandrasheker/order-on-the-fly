import { NextRequest, NextResponse } from "next/server";
import { requireTenantAdminFromRequest } from "@/lib/tenant-admin-auth";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";
import { getCommandCenter } from "@/platform/command-center/metrics-service";
import { resolveTimeRange } from "@/platform/command-center/time-range";

async function handleGET(req: NextRequest) {
  const auth = await requireTenantAdminFromRequest(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const search = req.nextUrl.searchParams;
    const payload = await getCommandCenter({
      tenantId: auth.session.tenantId,
      range: resolveTimeRange({
        preset: search.get("range") ?? search.get("preset"),
        from: search.get("from"),
        to: search.get("to"),
      }),
      linkStyle: "tenant",
    });
    if (!payload.tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof Error && (error as Error & { status?: number }).status === 404) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}

export const GET = withForensicApiRoute(handleGET);

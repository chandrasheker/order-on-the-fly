import { NextRequest, NextResponse } from "next/server";
import { requireTenantAdminFromRequest } from "@/lib/tenant-admin-auth";
import { presentTenantAdminOverview } from "@/lib/tenant-admin-details";
import { getTenantOverview } from "@/lib/tenant-onboarding-service";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET(req: NextRequest) {
  const auth = await requireTenantAdminFromRequest(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const overview = await getTenantOverview(auth.session.tenantId);
  if (!overview || overview.tenant.id !== auth.session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(presentTenantAdminOverview(overview));
}

export const GET = withForensicApiRoute(handleGET);

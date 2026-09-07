import { NextRequest, NextResponse } from "next/server";
import { requireTenantAdminFromRequest } from "@/lib/tenant-admin-auth";
import { listTenantAdminFeatures } from "@/lib/tenant-admin-details";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET(req: NextRequest) {
  const auth = await requireTenantAdminFromRequest(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const restaurants = await listTenantAdminFeatures(auth.session.tenantId);
  return NextResponse.json({ restaurants });
}

export const GET = withForensicApiRoute(handleGET);

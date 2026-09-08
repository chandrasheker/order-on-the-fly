import { NextRequest, NextResponse } from "next/server";
import { requireTenantAdminFromRequest } from "@/lib/tenant-admin-auth";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET(req: NextRequest) {
  const auth = await requireTenantAdminFromRequest(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ admin: auth.session, tenant: auth.tenant });
}

export const GET = withForensicApiRoute(handleGET);

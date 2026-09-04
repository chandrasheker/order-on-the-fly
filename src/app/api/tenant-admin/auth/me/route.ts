import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/auth";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET() {
  const auth = await requireTenantAdmin();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ admin: auth.session, tenant: auth.tenant });
}

export const GET = withForensicApiRoute(handleGET);

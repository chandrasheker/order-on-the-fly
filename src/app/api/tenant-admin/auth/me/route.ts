import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/auth";

export async function GET() {
  const auth = await requireTenantAdmin();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ admin: auth.session, tenant: auth.tenant });
}

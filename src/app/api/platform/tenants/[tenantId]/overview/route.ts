import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth";
import { getTenantOverview } from "@/lib/tenant-onboarding-service";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tenantId } = await params;
  const overview = await getTenantOverview(tenantId);
  if (!overview) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  return NextResponse.json(overview);
}

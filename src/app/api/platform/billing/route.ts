import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateTenantSubscription } from "@/lib/tenant-service";
import type { TenantPlan } from "@/generated/prisma/client";

export async function GET(req: NextRequest) {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      subscriptions: { orderBy: { createdAt: "desc" }, take: 24 },
      restaurants: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  return NextResponse.json({ tenant });
}

export async function POST(req: NextRequest) {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const tenantId = String(body.tenantId ?? "");
  const plan = String(body.plan ?? "STARTER").toUpperCase() as TenantPlan;

  if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 });

  const validPlans: TenantPlan[] = ["STARTER", "PRO", "ENTERPRISE"];
  if (!validPlans.includes(plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const tenant = await updateTenantSubscription(tenantId, {
    plan,
    status: "ACTIVE",
    currentPeriodEnd: periodEnd,
  });

  return NextResponse.json({ ok: true, tenant });
}

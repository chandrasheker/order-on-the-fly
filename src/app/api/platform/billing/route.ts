import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  activateDemoPack,
  expireDemoIfNeeded,
  resolveBillingState,
  setTenantPaidPlan,
} from "@/lib/tenant-billing-service";
import type { TenantPlan } from "@/generated/prisma/client";

function serializeTenant(tenant: NonNullable<Awaited<ReturnType<typeof expireDemoIfNeeded>>>) {
  return {
    ...tenant,
    demoPackUsedAt: tenant.demoPackUsedAt?.toISOString() ?? null,
    demoExpiresAt: tenant.demoExpiresAt?.toISOString() ?? null,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
    subscriptions: tenant.subscriptions.map((s) => ({
      ...s,
      currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
    billing: resolveBillingState(tenant),
  };
}

export async function GET(req: NextRequest) {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 });

  const tenant = await expireDemoIfNeeded(tenantId);
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  return NextResponse.json({ tenant: serializeTenant(tenant) });
}

export async function POST(req: NextRequest) {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const tenantId = String(body.tenantId ?? "");
  const action = String(body.action ?? "set_plan");

  if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 });

  try {
    if (action === "activate_demo") {
      const tenant = await activateDemoPack(tenantId);
      if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
      return NextResponse.json({ ok: true, tenant: serializeTenant(tenant) });
    }

    const plan = String(body.plan ?? "STARTER").toUpperCase() as TenantPlan;
    const validPlans: TenantPlan[] = ["STARTER", "PRO", "ENTERPRISE"];
    if (!validPlans.includes(plan)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const tenant = await setTenantPaidPlan(tenantId, plan);
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    return NextResponse.json({ ok: true, tenant: serializeTenant(tenant) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Billing update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

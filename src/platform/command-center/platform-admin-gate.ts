import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PLATFORM_ADMIN_COOKIE, requirePlatformAdmin, verifyPlatformAdminToken, type PlatformAdminSession } from "@/lib/auth";
import { classifyRequestHost, platformRoutesAllowedOnHost } from "@/platform/host";
import {
  AUDIT_ACTION,
  AUDIT_ACTOR_TYPE,
  AUDIT_CATEGORY,
  AUDIT_EVENT_KIND,
  AUDIT_SEVERITY,
} from "@/platform/forensics/constants";
import { tryAppendPlatformAuditEvent } from "@/platform/forensics/platform-audit-service";
import { markForensicSecurityDenied, setForensicActor, setForensicTenant } from "@/platform/forensics/request-context";

export async function denyPlatformAdminAccess(reason: string) {
  markForensicSecurityDenied();
  void tryAppendPlatformAuditEvent({
    eventKind: AUDIT_EVENT_KIND.SECURITY,
    severity: AUDIT_SEVERITY.WARN,
    category: AUDIT_CATEGORY.SECURITY,
    action: AUDIT_ACTION.PLATFORM_AUDIT_ACCESS_DENIED,
    outcome: "DENIED",
    metadata: { reason },
  });
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function requireApexPlatformAdmin(req: NextRequest): Promise<
  { ok: true; admin: PlatformAdminSession } | { ok: false; response: NextResponse }
> {
  if (!platformRoutesAllowedOnHost(classifyRequestHost(req.headers))) {
    return { ok: false, response: await denyPlatformAdminAccess("host") };
  }
  const cookie = req.cookies.get(PLATFORM_ADMIN_COOKIE)?.value;
  const requestAdmin = cookie ? await verifyPlatformAdminToken(cookie) : null;
  const admin = requestAdmin ?? (await requirePlatformAdmin());
  if (!admin) {
    return { ok: false, response: await denyPlatformAdminAccess("unauthenticated") };
  }
  setForensicActor({
    type: AUDIT_ACTOR_TYPE.PLATFORM_ADMIN,
    id: admin.id,
    name: admin.name,
    role: "PLATFORM_ADMIN",
  });
  return { ok: true, admin };
}

export async function bindTenantCommandForensics(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });
  setForensicTenant({ tenantId });
  if (!tenant) {
    const err = new Error("Tenant not found") as Error & { status?: number };
    err.status = 404;
    throw err;
  }
}

export async function bindRestaurantCommandForensics(tenantId: string, restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, tenantId: true },
  });
  if (!restaurant || restaurant.tenantId !== tenantId) {
    setForensicTenant({ tenantId });
    const err = new Error("Restaurant not found in tenant") as Error & { status?: number };
    err.status = 404;
    throw err;
  }
  setForensicTenant({ tenantId: restaurant.tenantId, restaurantId: restaurant.id });
}

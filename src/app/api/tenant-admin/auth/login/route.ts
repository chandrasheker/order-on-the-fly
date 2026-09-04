import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createTenantAdminToken,
  TENANT_ADMIN_COOKIE,
  staffSessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";
import { resolveTenantFromHost } from "@/platform/host-tenant";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";
import { AUDIT_ACTION, AUDIT_ACTOR_TYPE, AUDIT_CATEGORY, AUDIT_EVENT_KIND, AUDIT_SEVERITY } from "@/platform/forensics/constants";
import { setForensicActor, setForensicTenant } from "@/platform/forensics/request-context";
import { tryAppendPlatformAuditEvent } from "@/platform/forensics/platform-audit-service";

async function handlePOST(req: NextRequest) {
  const resolution = await resolveTenantFromHost(req.headers);
  if (!resolution.ok || resolution.kind !== "tenant") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  const admin = await prisma.tenantAdmin.findFirst({
    where: { tenantId: resolution.tenant.tenantId, email },
  });
  if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
    setForensicActor({ type: AUDIT_ACTOR_TYPE.ANONYMOUS });
    void tryAppendPlatformAuditEvent({
      eventKind: AUDIT_EVENT_KIND.SECURITY,
      severity: AUDIT_SEVERITY.WARN,
      category: AUDIT_CATEGORY.AUTH,
      action: AUDIT_ACTION.TENANT_ADMIN_LOGIN_FAILED,
      outcome: "DENIED",
      actorType: AUDIT_ACTOR_TYPE.ANONYMOUS,
      tenantId: resolution.tenant.tenantId,
      metadata: { attemptedEmailNormalized: email },
    });
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = await createTenantAdminToken({
    id: admin.id,
    email: admin.email,
    name: admin.name,
    tenantId: admin.tenantId,
  });
  setForensicActor({
    type: AUDIT_ACTOR_TYPE.TENANT_ADMIN,
    id: admin.id,
    name: admin.name,
    role: "TENANT_ADMIN",
  });
  setForensicTenant({ tenantId: admin.tenantId });
  void tryAppendPlatformAuditEvent({
    category: AUDIT_CATEGORY.AUTH,
    action: AUDIT_ACTION.TENANT_ADMIN_LOGIN_SUCCEEDED,
    actorType: AUDIT_ACTOR_TYPE.TENANT_ADMIN,
    actorId: admin.id,
    actorName: admin.name,
    tenantId: admin.tenantId,
  });
  const response = NextResponse.json({
    ok: true,
    admin: { id: admin.id, email: admin.email, name: admin.name, tenantId: admin.tenantId },
  });
  response.cookies.set(TENANT_ADMIN_COOKIE, token, staffSessionCookieOptions());
  return response;
}

export const POST = withForensicApiRoute(handlePOST);

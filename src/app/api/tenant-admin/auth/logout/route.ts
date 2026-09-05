import { NextResponse } from "next/server";
import { TENANT_ADMIN_COOKIE, getTenantAdminSession, staffSessionCookieOptions } from "@/lib/auth";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";
import { AUDIT_ACTION, AUDIT_ACTOR_TYPE, AUDIT_CATEGORY } from "@/platform/forensics/constants";
import { setForensicActor } from "@/platform/forensics/request-context";
import { tryAppendPlatformAuditEvent } from "@/platform/forensics/platform-audit-service";

async function handlePOST() {
  const session = await getTenantAdminSession();
  if (session) {
    setForensicActor({
      type: AUDIT_ACTOR_TYPE.TENANT_ADMIN,
      id: session.id,
      name: session.name,
      role: "TENANT_ADMIN",
    });
    void tryAppendPlatformAuditEvent({
      category: AUDIT_CATEGORY.AUTH,
      action: AUDIT_ACTION.TENANT_ADMIN_LOGOUT,
      actorType: AUDIT_ACTOR_TYPE.TENANT_ADMIN,
      actorId: session.id,
      actorName: session.name,
      tenantId: session.tenantId,
    });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(TENANT_ADMIN_COOKIE, "", { ...staffSessionCookieOptions(), maxAge: 0 });
  return response;
}

export const POST = withForensicApiRoute(handlePOST);

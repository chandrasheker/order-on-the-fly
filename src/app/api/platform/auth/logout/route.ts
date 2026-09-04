import { NextResponse } from "next/server";
import { PLATFORM_ADMIN_COOKIE, getPlatformAdminSession } from "@/lib/auth";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";
import { AUDIT_ACTION, AUDIT_ACTOR_TYPE, AUDIT_CATEGORY } from "@/platform/forensics/constants";
import { setForensicActor } from "@/platform/forensics/request-context";
import { tryAppendPlatformAuditEvent } from "@/platform/forensics/platform-audit-service";

async function handlePOST() {
  const admin = await getPlatformAdminSession();
  if (admin) {
    setForensicActor({
      type: AUDIT_ACTOR_TYPE.PLATFORM_ADMIN,
      id: admin.id,
      name: admin.name,
      role: "PLATFORM_ADMIN",
    });
    void tryAppendPlatformAuditEvent({
      category: AUDIT_CATEGORY.AUTH,
      action: AUDIT_ACTION.PLATFORM_ADMIN_LOGOUT,
      actorType: AUDIT_ACTOR_TYPE.PLATFORM_ADMIN,
      actorId: admin.id,
      actorName: admin.name,
    });
  }
  const response = NextResponse.json({ success: true });
  response.cookies.set(PLATFORM_ADMIN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}

export const POST = withForensicApiRoute(handlePOST);

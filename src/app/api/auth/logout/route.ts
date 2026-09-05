import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { STAFF_SESSION_COOKIE, verifyToken } from "@/lib/auth";
import { endStaffSession } from "@/lib/staff-session-service";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";
import { AUDIT_ACTION, AUDIT_ACTOR_TYPE, AUDIT_CATEGORY } from "@/platform/forensics/constants";
import { setForensicActor } from "@/platform/forensics/request-context";
import { tryAppendPlatformAuditEvent } from "@/platform/forensics/platform-audit-service";

async function handlePOST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(STAFF_SESSION_COOKIE)?.value;
  if (token) {
    const payload = await verifyToken(token);
    if (payload?.staffSessionId) {
      await endStaffSession(payload.staffSessionId);
    }
    if (payload) {
      setForensicActor({
        type: AUDIT_ACTOR_TYPE.STAFF,
        id: payload.id,
        name: payload.name,
        role: payload.role,
        sessionId: payload.staffSessionId,
      });
      void tryAppendPlatformAuditEvent({
        category: AUDIT_CATEGORY.AUTH,
        action: AUDIT_ACTION.STAFF_LOGOUT,
        actorType: AUDIT_ACTOR_TYPE.STAFF,
        actorId: payload.id,
        actorName: payload.name,
        actorRole: payload.role,
        actorSessionId: payload.staffSessionId,
        restaurantId: payload.restaurantId,
      });
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete(STAFF_SESSION_COOKIE);
  return response;
}

export const POST = withForensicApiRoute(handlePOST);

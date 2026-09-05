import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createPlatformAdminToken,
  PLATFORM_ADMIN_COOKIE,
  verifyPassword,
} from "@/lib/auth";
import { classifyRequestHost, platformRoutesAllowedOnHost } from "@/platform/host";
import { logApiError, logApiRequest, logInfo, logWarn } from "@/lib/logger";
import { recordLoginAudit, requestClientMeta } from "@/lib/login-audit-service";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";
import { AUDIT_ACTION, AUDIT_ACTOR_TYPE, AUDIT_CATEGORY, AUDIT_EVENT_KIND, AUDIT_SEVERITY } from "@/platform/forensics/constants";
import { setForensicActor } from "@/platform/forensics/request-context";
import { tryAppendPlatformAuditEvent } from "@/platform/forensics/platform-audit-service";

async function handlePOST(req: NextRequest) {
  if (!platformRoutesAllowedOnHost(classifyRequestHost(req.headers))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  logApiRequest("platform/auth/login", "POST");
  const client = requestClientMeta(req);

  try {
    const { email: bodyEmail, password: bodyPassword } = await req.json();
    const email = String(bodyEmail).trim().toLowerCase();
    const password = String(bodyPassword);

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const admin = await prisma.platformAdmin.findUnique({ where: { email } });

    if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
      await recordLoginAudit({
        kind: "PLATFORM_ADMIN",
        success: false,
        email,
        platformAdminId: admin?.id,
        failureReason: "Invalid credentials",
        ...client,
      });
      logWarn("platform/auth/login", "Invalid platform admin credentials", { email });
      setForensicActor({ type: AUDIT_ACTOR_TYPE.ANONYMOUS });
      void tryAppendPlatformAuditEvent({
        eventKind: AUDIT_EVENT_KIND.SECURITY,
        severity: AUDIT_SEVERITY.WARN,
        category: AUDIT_CATEGORY.AUTH,
        action: AUDIT_ACTION.PLATFORM_ADMIN_LOGIN_FAILED,
        outcome: "DENIED",
        actorType: AUDIT_ACTOR_TYPE.ANONYMOUS,
        metadata: { attemptedEmailNormalized: email },
      });
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    await recordLoginAudit({
      kind: "PLATFORM_ADMIN",
      success: true,
      email,
      platformAdminId: admin.id,
      ...client,
    });

    const session = {
      type: "platform_admin" as const,
      id: admin.id,
      email: admin.email,
      name: admin.name,
    };

    const token = await createPlatformAdminToken(session);

    logInfo("platform/auth/login", "Platform admin login successful", { adminId: admin.id });
    setForensicActor({
      type: AUDIT_ACTOR_TYPE.PLATFORM_ADMIN,
      id: admin.id,
      name: admin.name,
      role: "PLATFORM_ADMIN",
    });
    void tryAppendPlatformAuditEvent({
      category: AUDIT_CATEGORY.AUTH,
      action: AUDIT_ACTION.PLATFORM_ADMIN_LOGIN_SUCCEEDED,
      actorType: AUDIT_ACTOR_TYPE.PLATFORM_ADMIN,
      actorId: admin.id,
      actorName: admin.name,
      actorRole: "PLATFORM_ADMIN",
    });

    const response = NextResponse.json({ admin: session });
    response.cookies.set(PLATFORM_ADMIN_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch (error) {
    logApiError("platform/auth/login", "POST", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}

export const POST = withForensicApiRoute(handlePOST);

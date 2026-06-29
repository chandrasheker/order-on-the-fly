import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createPlatformAdminToken,
  PLATFORM_ADMIN_COOKIE,
  verifyPassword,
} from "@/lib/auth";
import { logApiError, logApiRequest, logInfo, logWarn } from "@/lib/logger";

export async function POST(req: NextRequest) {
  logApiRequest("platform/auth/login", "POST");
  try {
    const { email: bodyEmail, password: bodyPassword } = await req.json();
    const email = String(bodyEmail).trim().toLowerCase();
    const password = String(bodyPassword);

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const admin = await prisma.platformAdmin.findUnique({ where: { email } });

    if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
      logWarn("platform/auth/login", "Invalid platform admin credentials", { email });
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const session = {
      type: "platform_admin" as const,
      id: admin.id,
      email: admin.email,
      name: admin.name,
    };

    const token = await createPlatformAdminToken(session);

    logInfo("platform/auth/login", "Platform admin login successful", { adminId: admin.id });

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

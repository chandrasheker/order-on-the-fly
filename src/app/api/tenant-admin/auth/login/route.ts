import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createTenantAdminToken,
  TENANT_ADMIN_COOKIE,
  staffSessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";
import { resolveTenantFromHost } from "@/platform/host-tenant";

export async function POST(req: NextRequest) {
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
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = await createTenantAdminToken({
    id: admin.id,
    email: admin.email,
    name: admin.name,
    tenantId: admin.tenantId,
  });
  const response = NextResponse.json({
    ok: true,
    admin: { id: admin.id, email: admin.email, name: admin.name, tenantId: admin.tenantId },
  });
  response.cookies.set(TENANT_ADMIN_COOKIE, token, staffSessionCookieOptions());
  return response;
}

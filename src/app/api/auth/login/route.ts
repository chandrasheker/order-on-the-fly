import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createToken, verifyPassword, STAFF_SESSION_COOKIE, staffSessionCookieOptions } from "@/lib/auth";
import { getStaffHomePath } from "@/lib/feature-flags";
import { logApiError, logApiRequest, logInfo, logWarn } from "@/lib/logger";
import { getRestaurantAccessState, accessBlockMessage } from "@/lib/access-control-service";
import { recordLoginAudit, requestClientMeta } from "@/lib/login-audit-service";
import { startStaffSession } from "@/lib/staff-session-service";
import { jsonHostTenantNotFound, resolveTenantFromHost } from "@/platform/host-tenant";
import { allowsLegacyRestaurantScoping } from "@/platform/host";

export async function POST(req: NextRequest) {
  logApiRequest("auth/login", "POST");
  const client = requestClientMeta(req);

  try {
    const { email: bodyEmail, password: bodyPassword } = await req.json();
    const email = String(bodyEmail).trim().toLowerCase();
    const password = String(bodyPassword);

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const hostTenant = await resolveTenantFromHost(req);
    if (!hostTenant.ok) {
      return NextResponse.json(jsonHostTenantNotFound(), { status: 404 });
    }
    if (hostTenant.kind === "reserved" && !allowsLegacyRestaurantScoping(hostTenant.host)) {
      return NextResponse.json(jsonHostTenantNotFound(), { status: 404 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { restaurant: true },
    });

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      const anyUsers = await prisma.user.count();
      if (anyUsers === 0) {
        logWarn("auth/login", "Login failed: database not seeded");
        return NextResponse.json(
          { error: "Login unavailable. Please contact your administrator." },
          { status: 503 },
        );
      }
      await recordLoginAudit({
        kind: "STAFF",
        success: false,
        email,
        userId: user?.id,
        tenantId: user?.tenantId,
        restaurantId: user?.restaurantId,
        role: user?.role,
        failureReason: "Invalid credentials",
        ...client,
      });
      logWarn("auth/login", "Invalid credentials", {
        email,
        userExists: Boolean(user),
      });
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const hostRestaurant = hostTenant.kind === "restaurant" ? hostTenant.context : null;
    if (
      hostRestaurant &&
      (user.restaurantId !== hostRestaurant.restaurantId ||
        user.restaurant.slug !== hostRestaurant.restaurantSlug)
    ) {
      await recordLoginAudit({
        kind: "STAFF",
        success: false,
        email,
        userId: user.id,
        tenantId: user.tenantId,
        restaurantId: user.restaurantId,
        role: user.role,
        failureReason: "HOST_RESTAURANT_MISMATCH",
        ...client,
      });
      logWarn("auth/login", "Host restaurant mismatch", { email });
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const access = await getRestaurantAccessState(user.restaurantId);
    if (!access.ok) {
      await recordLoginAudit({
        kind: "STAFF",
        success: false,
        email,
        userId: user.id,
        tenantId: user.tenantId,
        restaurantId: user.restaurantId,
        role: user.role,
        failureReason: access.reason,
        ...client,
      });
      return NextResponse.json(
        { error: accessBlockMessage(access.reason), code: access.reason },
        { status: 403 },
      );
    }

    const staffSession = await startStaffSession({
      userId: user.id,
      restaurantId: user.restaurantId,
      tenantId: user.tenantId ?? user.restaurant.tenantId,
      role: user.role,
      ...client,
    });

    await recordLoginAudit({
      kind: "STAFF",
      success: true,
      email,
      userId: user.id,
      tenantId: user.tenantId,
      restaurantId: user.restaurantId,
      role: user.role,
      ...client,
    });

    logInfo("auth/login", "Login successful", {
      userId: user.id,
      role: user.role,
      restaurantId: user.restaurantId,
    });

    const session = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      restaurantId: user.restaurantId,
      restaurantName: user.restaurant.name,
      restaurantSlug: user.restaurant.slug,
      staffSessionId: staffSession.id,
    };

    const token = await createToken(session);
    const homePath = await getStaffHomePath(user.restaurantId, user.role);

    const response = NextResponse.json({ user: session, homePath });
    response.cookies.set(STAFF_SESSION_COOKIE, token, staffSessionCookieOptions());

    return response;
  } catch (error) {
    logApiError("auth/login", "POST", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}

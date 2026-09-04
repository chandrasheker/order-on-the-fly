import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import bcrypt from "bcryptjs";
import type { Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { classifyRequestHost, platformRoutesAllowedOnHost, sessionAllowedFromHeaders } from "@/platform/host";
import { getJwtSecretBytes } from "@/lib/jwt-secret";

function jwtSecret() {
  return getJwtSecretBytes();
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  staffSessionId?: string;
}

export interface PlatformAdminSession {
  type: "platform_admin";
  id: string;
  email: string;
  name: string;
}

export interface TenantAdminSession {
  type: "tenant_admin";
  id: string;
  email: string;
  name: string;
  tenantId: string;
}

export const STAFF_SESSION_COOKIE = "tabletap_session";
export const PLATFORM_ADMIN_COOKIE = "tabletap_admin_session";
export const TENANT_ADMIN_COOKIE = "tabletap_tenant_session";

export function staffSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  };
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createToken(user: SessionUser) {
  return new SignJWT({ ...user, type: "staff" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(jwtSecret());
}

export async function createTenantAdminToken(admin: Omit<TenantAdminSession, "type">) {
  return new SignJWT({ ...admin, type: "tenant_admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(jwtSecret());
}

export async function createPlatformAdminToken(admin: Omit<PlatformAdminSession, "type">) {
  return new SignJWT({ ...admin, type: "platform_admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(jwtSecret());
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret());
    if (payload.type === "platform_admin" || payload.type === "tenant_admin") return null;
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

export async function verifyPlatformAdminToken(
  token: string
): Promise<PlatformAdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret());
    if (payload.type !== "platform_admin") return null;
    return payload as unknown as PlatformAdminSession;
  } catch {
    return null;
  }
}

async function sessionAllowedOnRequestHost(session: SessionUser): Promise<boolean> {
  return sessionAllowedFromHeaders(session.restaurantSlug, async () => {
    const { headers } = await import("next/headers");
    return headers();
  });
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(STAFF_SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      tenantId: true,
      restaurantId: true,
      restaurant: { select: { id: true, name: true, slug: true, tenantId: true } },
    },
  });

  if (!user?.restaurant) return null;

  const { getRestaurantAccessState } = await import("@/lib/access-control-service");
  const access = await getRestaurantAccessState(user.restaurant.id);
  if (!access.ok) return null;

  const { syncStaffSessionForUser } = await import("@/lib/staff-session-service");
  const staffSessionId = await syncStaffSessionForUser({
    userId: user.id,
    restaurantId: user.restaurant.id,
    tenantId: user.tenantId ?? user.restaurant.tenantId ?? access.tenantId,
    role: user.role,
    preferredSessionId: payload.staffSessionId,
  });

  const sessionUser: SessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    restaurantId: user.restaurant.id,
    restaurantName: user.restaurant.name,
    restaurantSlug: user.restaurant.slug,
    staffSessionId,
  };

  if (staffSessionId !== payload.staffSessionId) {
    try {
      const newToken = await createToken(sessionUser);
      cookieStore.set(STAFF_SESSION_COOKIE, newToken, staffSessionCookieOptions());
    } catch {
      // Cookie writes are not allowed in some server component contexts.
    }
  }

  if (!(await sessionAllowedOnRequestHost(sessionUser))) {
    return null;
  }

  return sessionUser;
}

export async function getPlatformAdminSession(): Promise<PlatformAdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PLATFORM_ADMIN_COOKIE)?.value;
  if (!token) return null;
  return verifyPlatformAdminToken(token);
}

export async function requireSession(roles?: Role[]) {
  const session = await getSession();
  if (!session) return null;
  if (roles && !roles.includes(session.role)) return null;
  return session;
}

export async function verifyTenantAdminToken(token: string): Promise<TenantAdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret());
    if (payload.type !== "tenant_admin") return null;
    return payload as unknown as TenantAdminSession;
  } catch {
    return null;
  }
}

export async function getTenantAdminSession(): Promise<TenantAdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(TENANT_ADMIN_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyTenantAdminToken(token);
  if (!payload) return null;

  const admin = await prisma.tenantAdmin.findUnique({
    where: { id: payload.id },
    select: { id: true, email: true, name: true, tenantId: true, tenant: { select: { isEnabled: true } } },
  });
  if (!admin || !admin.tenant.isEnabled) return null;
  if (admin.tenantId !== payload.tenantId) return null;
  return {
    type: "tenant_admin",
    id: admin.id,
    email: admin.email,
    name: admin.name,
    tenantId: admin.tenantId,
  };
}

export async function requireTenantAdmin() {
  const { resolveTenantFromHeaders } = await import("@/platform/host-tenant");
  const resolution = await resolveTenantFromHeaders();
  if (!resolution.ok || resolution.kind !== "tenant") return null;
  const session = await getTenantAdminSession();
  if (!session || session.tenantId !== resolution.tenant.tenantId) return null;
  return { session, tenant: resolution.tenant };
}

export async function requirePlatformAdmin() {
  let headerList: Headers;
  try {
    headerList = await headers();
  } catch {
    return null;
  }
  if (!platformRoutesAllowedOnHost(classifyRequestHost(headerList))) {
    return null;
  }
  return getPlatformAdminSession();
}

export function canManageMenu(role: Role) {
  return role === "OWNER" || role === "MANAGER";
}

export function canMutatePaymentGatewayCredentials(role: Role) {
  return role === "OWNER";
}

export function canMutatePrinterAgentCredentials(role: Role) {
  return role === "OWNER";
}

export function canManageStaff(role: Role) {
  return role === "OWNER" || role === "MANAGER";
}

export function canViewReports(role: Role) {
  return role === "OWNER" || role === "MANAGER";
}

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import type { Role } from "@/generated/prisma/client";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "tabletap-super-secret-key-change-in-production"
);

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
}

export interface PlatformAdminSession {
  type: "platform_admin";
  id: string;
  email: string;
  name: string;
}

export const STAFF_SESSION_COOKIE = "tabletap_session";
export const PLATFORM_ADMIN_COOKIE = "tabletap_admin_session";

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
    .sign(JWT_SECRET);
}

export async function createPlatformAdminToken(admin: Omit<PlatformAdminSession, "type">) {
  return new SignJWT({ ...admin, type: "platform_admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.type === "platform_admin") return null;
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

export async function verifyPlatformAdminToken(
  token: string
): Promise<PlatformAdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.type !== "platform_admin") return null;
    return payload as unknown as PlatformAdminSession;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(STAFF_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
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

export async function requirePlatformAdmin() {
  return getPlatformAdminSession();
}

export function canManageMenu(role: Role) {
  return role === "OWNER" || role === "MANAGER";
}

export function canManageStaff(role: Role) {
  return role === "OWNER" || role === "MANAGER";
}

export function canViewReports(role: Role) {
  return role === "OWNER" || role === "MANAGER";
}

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

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createToken(user: SessionUser) {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("tabletap_session")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function requireSession(roles?: Role[]) {
  const session = await getSession();
  if (!session) return null;
  if (roles && !roles.includes(session.role)) return null;
  return session;
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

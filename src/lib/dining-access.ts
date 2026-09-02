import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "tabletap-super-secret-key-change-in-production",
);

export const DINING_COOKIE = "tabletap_dining";
/** Dining pass lifetime after check-in (3 hours). */
export const DINING_TTL_SEC = 3 * 60 * 60;

export interface DiningTokenPayload {
  type: "dining";
  tableId: string;
  tableToken: string;
  sessionKey: string;
  restaurantId?: string;
  restaurantSlug?: string;
}

export async function createDiningToken(payload: Omit<DiningTokenPayload, "type">) {
  return new SignJWT({ ...payload, type: "dining" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DINING_TTL_SEC}s`)
    .sign(JWT_SECRET);
}

export async function verifyDiningToken(token: string): Promise<DiningTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.type !== "dining") return null;
    if (
      typeof payload.tableId !== "string" ||
      typeof payload.tableToken !== "string" ||
      typeof payload.sessionKey !== "string"
    ) {
      return null;
    }
    return {
      type: "dining",
      tableId: payload.tableId,
      tableToken: payload.tableToken,
      sessionKey: payload.sessionKey,
      restaurantId: typeof payload.restaurantId === "string" ? payload.restaurantId : undefined,
      restaurantSlug: typeof payload.restaurantSlug === "string" ? payload.restaurantSlug : undefined,
    };
  } catch {
    return null;
  }
}

export async function readDiningTokenFromCookies() {
  const jar = await cookies();
  const raw = jar.get(DINING_COOKIE)?.value;
  if (!raw) return null;
  return verifyDiningToken(raw);
}

export async function readDiningTokenFromRequest(req: NextRequest) {
  const raw = req.cookies.get(DINING_COOKIE)?.value;
  if (!raw) return null;
  return verifyDiningToken(raw);
}

export function diningCookieOptions(maxAge = DINING_TTL_SEC) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getJwtSecretBytes } from "@/lib/jwt-secret";

const JWT_SECRET = getJwtSecretBytes();

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

export type ScopedDiningTable = {
  id: string;
  qrToken: string;
  restaurantId: string;
  restaurant?: { slug?: string | null } | null;
};

/** Dining restaurant claims disagree with the already hostname-scoped table. */
export function diningTokenConflictsWithScopedTable(
  dining: DiningTokenPayload | null | undefined,
  table: ScopedDiningTable,
): boolean {
  if (!dining) return false;
  if (dining.restaurantId && dining.restaurantId !== table.restaurantId) return true;
  if (dining.restaurantSlug) {
    const slug = table.restaurant?.slug;
    if (!slug || dining.restaurantSlug !== slug) return true;
  }
  return false;
}

/**
 * Bind a dining token to a table that was already resolved from the request host.
 * The token must never independently select a restaurant on a restaurant hostname.
 */
export function diningTokenMatchesScopedTable(
  dining: DiningTokenPayload | null | undefined,
  table: ScopedDiningTable,
  sessionKey: string,
): boolean {
  if (!dining || !sessionKey) return false;
  if (diningTokenConflictsWithScopedTable(dining, table)) return false;
  return (
    dining.tableId === table.id &&
    dining.tableToken === table.qrToken &&
    dining.sessionKey === sessionKey
  );
}

export function authorizeGuestTableSwitchRead(params: {
  resolutionOk: boolean;
  table: (ScopedDiningTable & { isActive?: boolean }) | null | undefined;
  dining: DiningTokenPayload | null;
  sessionKey: string;
}):
  | { ok: true; sourceTableId: string; restaurantId: string }
  | { ok: false; status: 404 }
  | { ok: false; status: 403; error: string } {
  const { resolutionOk, table, dining, sessionKey } = params;
  if (!resolutionOk || !table || table.isActive === false) {
    return { ok: false, status: 404 };
  }
  if (diningTokenConflictsWithScopedTable(dining, table)) {
    return { ok: false, status: 404 };
  }
  if (!diningTokenMatchesScopedTable(dining, table, sessionKey)) {
    return {
      ok: false,
      status: 403,
      error: "Scan the QR code at your table to view table switch status",
    };
  }
  return { ok: true, sourceTableId: table.id, restaurantId: table.restaurantId };
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

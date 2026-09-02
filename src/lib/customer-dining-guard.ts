import { NextResponse } from "next/server";
import {
  createDiningToken,
  diningCookieOptions,
  DINING_COOKIE,
  readDiningTokenFromRequest,
} from "@/lib/dining-access";
import { joinTableSession, validateTableSession } from "@/lib/table-session-service";
import { hasOpenTableWork } from "@/lib/table-ordering-service";
import { loadTableByQrForRequest } from "@/platform/tenant-scope";

export async function assertCustomerDiningAccess(
  req: import("next/server").NextRequest,
  tableToken: string,
  sessionKey?: string,
) {
  const { table, resolution } = await loadTableByQrForRequest(req, tableToken);
  if (!resolution.ok) {
    return { ok: false as const, status: 404, error: "Table not found" };
  }

  if (!table || !table.isActive) {
    return { ok: false as const, status: 404, error: "Table not found" };
  }

  const openTableWork = await hasOpenTableWork(table.id);

  if (!table.orderingEnabled && !openTableWork) {
    return {
      ok: false as const,
      status: 403,
      error: "This table is not accepting orders. Please scan the QR at your table or ask staff.",
      code: "TABLE_ORDERING_CLOSED",
    };
  }

  const dining = await readDiningTokenFromRequest(req);
  if (dining?.restaurantId && dining.restaurantId !== table.restaurantId) {
    return { ok: false as const, status: 404, error: "Table not found" };
  }
  const effectiveSessionKey = sessionKey ?? dining?.sessionKey;
  if (
    !dining ||
    dining.tableToken !== tableToken ||
    dining.tableId !== table.id ||
    !effectiveSessionKey ||
    (sessionKey && dining.sessionKey !== sessionKey)
  ) {
    return {
      ok: false as const,
      status: 403,
      error: "Scan the QR code at your table to start ordering.",
      code: "DINING_CHECKIN_REQUIRED",
    };
  }

  let sessionValid = await validateTableSession(table.id, effectiveSessionKey);
  if (!sessionValid && (table.orderingEnabled || openTableWork)) {
    const joined = await joinTableSession(table.id, effectiveSessionKey, table.maxSessions);
    sessionValid = joined.active;
  }

  if (!sessionValid) {
    return {
      ok: false as const,
      status: 403,
      error: "Your table session expired. Scan the QR code again to continue ordering.",
      code: "TABLE_SESSION_EXPIRED",
    };
  }

  return { ok: true as const, table };
}

export async function issueDiningAccessResponse(
  table: { id: string; qrToken: string; number: number; maxSessions: number },
  sessionKey: string,
) {
  const join = await joinTableSession(table.id, sessionKey, table.maxSessions);
  if (!join.active) {
    return NextResponse.json(
      {
        error: `This table allows ${join.maxSessions} active device(s) at a time. Ask someone at the table to finish or leave first.`,
        code: "TABLE_SESSION_FULL",
        maxSessions: join.maxSessions,
        activeCount: join.activeCount,
      },
      { status: 403 },
    );
  }

  const token = await createDiningToken({
    tableId: table.id,
    tableToken: table.qrToken,
    sessionKey,
    restaurantId: "restaurantId" in table ? String(table.restaurantId ?? "") || undefined : undefined,
    restaurantSlug:
      "restaurant" in table && table.restaurant && typeof table.restaurant === "object"
        ? String((table.restaurant as { slug?: string }).slug ?? "") || undefined
        : undefined,
  });

  const response = NextResponse.json({
    success: true,
    tableNumber: table.number,
    returning: join.returning,
    maxSessions: join.maxSessions,
    activeCount: join.activeCount,
  });
  response.cookies.set(DINING_COOKIE, token, diningCookieOptions());
  return response;
}

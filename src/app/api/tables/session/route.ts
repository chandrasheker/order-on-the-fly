import { NextRequest, NextResponse } from "next/server";
import {
  joinTableSession,
  heartbeatTableSession,
  leaveTableSession,
} from "@/lib/table-session-service";
import { loadTableByQrForRequest, opaqueNotFoundJson } from "@/platform/tenant-scope";
import {
  createDiningToken,
  diningCookieOptions,
  DINING_COOKIE,
  diningTokenMatchesScopedTable,
  readDiningTokenFromRequest,
} from "@/lib/dining-access";
import { logApiError, logApiRequest } from "@/lib/logger";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function resolveTable(req: NextRequest, tableToken: string) {
  const { table, resolution } = await loadTableByQrForRequest(req, tableToken);
  if (!resolution.ok) return null;
  return table;
}

async function handlePOST(req: NextRequest) {
  logApiRequest("tables/session", "POST");
  try {
    const { tableToken, sessionKey } = await req.json();
    if (!tableToken || !sessionKey) {
      return NextResponse.json({ error: "Missing tableToken or sessionKey" }, { status: 400 });
    }

    const table = await resolveTable(req, tableToken);
    if (!table || !table.isActive) {
      return opaqueNotFoundJson();
    }

    const result = await joinTableSession(table.id, sessionKey, table.maxSessions);

    return NextResponse.json({
      tableNumber: table.number,
      ...result,
    });
  } catch (error) {
    logApiError("tables/session", "POST", error);
    return NextResponse.json({ error: "Failed to join table session" }, { status: 500 });
  }
}

export const POST = withForensicApiRoute(handlePOST);

async function handlePATCH(req: NextRequest) {
  try {
    const { tableToken, sessionKey } = await req.json();
    if (!tableToken || !sessionKey) {
      return NextResponse.json({ error: "Missing tableToken or sessionKey" }, { status: 400 });
    }

    const table = await resolveTable(req, tableToken);
    if (!table || !table.isActive) {
      return opaqueNotFoundJson();
    }

    const alive = await heartbeatTableSession(table.id, sessionKey);
    if (alive) {
      const dining = await readDiningTokenFromRequest(req);
      if (diningTokenMatchesScopedTable(dining, table, sessionKey)) {
        const token = await createDiningToken({
          tableId: table.id,
          tableToken,
          sessionKey,
          restaurantId: table.restaurantId,
          restaurantSlug: table.restaurant.slug,
        });
        const response = NextResponse.json({ active: true });
        response.cookies.set(DINING_COOKIE, token, diningCookieOptions());
        return response;
      }
    }
    return NextResponse.json({ active: alive });
  } catch (error) {
    logApiError("tables/session", "PATCH", error);
    return NextResponse.json({ error: "Failed to refresh session" }, { status: 500 });
  }
}

export const PATCH = withForensicApiRoute(handlePATCH);

async function handleDELETE(req: NextRequest) {
  try {
    const { tableToken, sessionKey } = await req.json();
    if (!tableToken || !sessionKey) {
      return NextResponse.json({ error: "Missing tableToken or sessionKey" }, { status: 400 });
    }

    const table = await resolveTable(req, tableToken);
    if (!table) {
      return NextResponse.json({ success: true });
    }

    await leaveTableSession(table.id, sessionKey);
    return NextResponse.json({ success: true });
  } catch (error) {
    logApiError("tables/session", "DELETE", error);
    return NextResponse.json({ error: "Failed to leave session" }, { status: 500 });
  }
}

export const DELETE = withForensicApiRoute(handleDELETE);

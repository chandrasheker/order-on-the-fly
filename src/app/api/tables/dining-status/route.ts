import { NextRequest, NextResponse } from "next/server";
import { readDiningTokenFromRequest } from "@/lib/dining-access";
import { loadTableByQrForRequest, opaqueNotFoundJson } from "@/platform/tenant-scope";
import {
  countActiveTableSessions,
  joinTableSession,
  validateTableSession,
} from "@/lib/table-session-service";
import { hasOpenTableWork } from "@/lib/table-ordering-service";

export async function GET(req: NextRequest) {
  const tableToken = req.nextUrl.searchParams.get("tableToken");
  const sessionKey = req.nextUrl.searchParams.get("sessionKey");

  if (!tableToken || !sessionKey) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const { table, resolution } = await loadTableByQrForRequest(req, tableToken);
  if (!resolution.ok || !table || !table.isActive) {
    return opaqueNotFoundJson();
  }

  const dining = await readDiningTokenFromRequest(req);
  const diningMatch = Boolean(
    dining &&
      dining.tableToken === tableToken &&
      dining.sessionKey === sessionKey &&
      dining.tableId === table.id,
  );

  const openTableWork = await hasOpenTableWork(table.id);

  let sessionActive = diningMatch ? await validateTableSession(table.id, sessionKey) : false;
  let activeCount = 0;

  if (diningMatch && !sessionActive && (table.orderingEnabled || openTableWork)) {
    const joined = await joinTableSession(table.id, sessionKey, table.maxSessions);
    sessionActive = joined.active;
    activeCount = joined.activeCount;
  } else if (sessionActive) {
    activeCount = await countActiveTableSessions(table.id);
  }

  const canOrder = table.orderingEnabled && diningMatch && sessionActive;
  const canTrackExistingOrder = openTableWork && diningMatch && sessionActive;

  let message: string | null = null;
  if (!table.orderingEnabled && !canTrackExistingOrder) {
    message =
      "This table is not open for ordering. Please ask your server to enable it when you are seated.";
  } else if (!diningMatch) {
    message = "Scan the QR code on your table to verify you are dining here.";
  } else if (!sessionActive) {
    message = "Your session expired. Scan the QR code at your table again.";
  }

  return NextResponse.json({
    tableNumber: table.number,
    orderingEnabled: table.orderingEnabled,
    diningVerified: diningMatch,
    sessionActive,
    canOrder,
    canTrackExistingOrder,
    maxSessions: table.maxSessions,
    activeCount,
    message,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readDiningTokenFromRequest } from "@/lib/dining-access";
import { validateTableSession } from "@/lib/table-session-service";

export async function GET(req: NextRequest) {
  const tableToken = req.nextUrl.searchParams.get("tableToken");
  const sessionKey = req.nextUrl.searchParams.get("sessionKey");

  if (!tableToken || !sessionKey) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const table = await prisma.table.findUnique({
    where: { qrToken: tableToken },
    select: { id: true, number: true, orderingEnabled: true, isActive: true, maxSessions: true },
  });

  if (!table || !table.isActive) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  const dining = await readDiningTokenFromRequest(req);
  const diningMatch = Boolean(
    dining &&
      dining.tableToken === tableToken &&
      dining.sessionKey === sessionKey &&
      dining.tableId === table.id,
  );

  const sessionActive = diningMatch
    ? await validateTableSession(table.id, sessionKey)
    : false;

  const canOrder = table.orderingEnabled && diningMatch && sessionActive;

  let message: string | null = null;
  if (!table.orderingEnabled) {
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
    maxSessions: table.maxSessions,
    message,
  });
}

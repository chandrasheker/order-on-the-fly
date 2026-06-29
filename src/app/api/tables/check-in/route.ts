import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logApiError, logApiRequest } from "@/lib/logger";
import { issueDiningAccessResponse } from "@/lib/customer-dining-guard";

export async function POST(req: NextRequest) {
  logApiRequest("tables/check-in", "POST");
  try {
    const { tableToken, sessionKey } = await req.json();
    if (!tableToken || !sessionKey) {
      return NextResponse.json({ error: "Missing tableToken or sessionKey" }, { status: 400 });
    }

    const table = await prisma.table.findUnique({
      where: { qrToken: tableToken },
      select: {
        id: true,
        qrToken: true,
        number: true,
        maxSessions: true,
        isActive: true,
        orderingEnabled: true,
      },
    });

    if (!table || !table.isActive) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    if (!table.orderingEnabled) {
      return NextResponse.json(
        {
          error:
            "This table is not open for ordering yet. Please ask your server to seat you and enable ordering.",
          code: "TABLE_ORDERING_CLOSED",
          tableNumber: table.number,
        },
        { status: 403 },
      );
    }

    return issueDiningAccessResponse(table, sessionKey);
  } catch (error) {
    logApiError("tables/check-in", "POST", error);
    return NextResponse.json({ error: "Check-in failed" }, { status: 500 });
  }
}

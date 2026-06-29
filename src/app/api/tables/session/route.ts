import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  joinTableSession,
  heartbeatTableSession,
  leaveTableSession,
} from "@/lib/table-session-service";
import { logApiError, logApiRequest } from "@/lib/logger";

async function resolveTable(tableToken: string) {
  return prisma.table.findUnique({
    where: { qrToken: tableToken },
    select: { id: true, number: true, maxSessions: true, isActive: true },
  });
}

export async function POST(req: NextRequest) {
  logApiRequest("tables/session", "POST");
  try {
    const { tableToken, sessionKey } = await req.json();
    if (!tableToken || !sessionKey) {
      return NextResponse.json({ error: "Missing tableToken or sessionKey" }, { status: 400 });
    }

    const table = await resolveTable(tableToken);
    if (!table || !table.isActive) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
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

export async function PATCH(req: NextRequest) {
  try {
    const { tableToken, sessionKey } = await req.json();
    if (!tableToken || !sessionKey) {
      return NextResponse.json({ error: "Missing tableToken or sessionKey" }, { status: 400 });
    }

    const table = await resolveTable(tableToken);
    if (!table || !table.isActive) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    const alive = await heartbeatTableSession(table.id, sessionKey);
    return NextResponse.json({ active: alive });
  } catch (error) {
    logApiError("tables/session", "PATCH", error);
    return NextResponse.json({ error: "Failed to refresh session" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { tableToken, sessionKey } = await req.json();
    if (!tableToken || !sessionKey) {
      return NextResponse.json({ error: "Missing tableToken or sessionKey" }, { status: 400 });
    }

    const table = await resolveTable(tableToken);
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

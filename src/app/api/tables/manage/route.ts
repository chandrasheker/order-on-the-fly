import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { canManageTableOrdering } from "@/lib/staff-permissions";
import { closeTableOrdering, openTableOrdering } from "@/lib/table-ordering-service";
import { countActiveTableSessions } from "@/lib/table-session-service";

export async function GET() {
  const session = await requireSession(["OWNER", "MANAGER", "SERVER"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: session.restaurantId },
    select: { defaultMaxSessions: true },
  });

  const tables = await prisma.table.findMany({
    where: { restaurantId: session.restaurantId },
    orderBy: { number: "asc" },
    select: { id: true, number: true, maxSessions: true, isActive: true, orderingEnabled: true },
  });

  const tablesWithCounts = await Promise.all(
    tables.map(async (table) => ({
      ...table,
      activeSessions: await countActiveTableSessions(table.id),
    }))
  );

  return NextResponse.json({
    defaultMaxSessions: restaurant?.defaultMaxSessions ?? 2,
    tables: tablesWithCounts,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession(["OWNER", "MANAGER", "SERVER"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  if (body.defaultMaxSessions !== undefined) {
    const value = Math.max(1, Math.min(20, parseInt(String(body.defaultMaxSessions), 10) || 2));
    await prisma.restaurant.update({
      where: { id: session.restaurantId },
      data: { defaultMaxSessions: value },
    });
    return NextResponse.json({ defaultMaxSessions: value });
  }

  if (body.tableId && body.orderingEnabled !== undefined) {
    if (!canManageTableOrdering(session.role)) {
      return NextResponse.json({ error: "Action not allowed for your role" }, { status: 403 });
    }
    const enabled = Boolean(body.orderingEnabled);
    const table = await prisma.table.findFirst({
      where: { id: body.tableId, restaurantId: session.restaurantId },
      select: { id: true },
    });
    if (!table) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }
    if (enabled) {
      await openTableOrdering(table.id);
    } else {
      await closeTableOrdering(table.id);
    }
    return NextResponse.json({ tableId: table.id, orderingEnabled: enabled });
  }

  if (body.tableId && body.maxSessions !== undefined) {
    if (session.role !== "OWNER" && session.role !== "MANAGER") {
      return NextResponse.json({ error: "Action not allowed for your role" }, { status: 403 });
    }
    const maxSessions = Math.max(1, Math.min(20, parseInt(String(body.maxSessions), 10) || 2));
    const table = await prisma.table.updateMany({
      where: { id: body.tableId, restaurantId: session.restaurantId },
      data: { maxSessions },
    });
    if (table.count === 0) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }
    return NextResponse.json({ tableId: body.tableId, maxSessions });
  }

  return NextResponse.json({ error: "Invalid update" }, { status: 400 });
}

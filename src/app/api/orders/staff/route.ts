import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createOrderForTable, OrderCreationError } from "@/lib/order-service";
import { canPlaceOfflineOrder } from "@/lib/staff-permissions";
import { prisma } from "@/lib/prisma";
import { logApiError, logApiRequest, logInfo } from "@/lib/logger";
import { sumOrderRevenue, todayDateString } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const session = await requireSession(["OWNER", "MANAGER", "SERVER"]);
  if (!session || !canPlaceOfflineOrder(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tableId = req.nextUrl.searchParams.get("tableId");
  if (!tableId) {
    return NextResponse.json({ error: "tableId is required" }, { status: 400 });
  }

  const table = await prisma.table.findFirst({
    where: { id: tableId, restaurantId: session.restaurantId },
    select: { id: true, number: true },
  });

  if (!table) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  const orders = await prisma.order.findMany({
    where: {
      tableId,
      restaurantId: session.restaurantId,
      date: todayDateString(),
      status: { not: "CANCELLED" },
    },
    include: {
      items: {
        select: {
          id: true,
          itemName: true,
          quantity: true,
          unitPrice: true,
          status: true,
          notes: true,
        },
        orderBy: { expectedReadyAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    table,
    orders: orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      status: order.status,
      paidAt: order.paidAt,
      createdAt: order.createdAt,
      total: sumOrderRevenue(order.items),
      items: order.items,
    })),
  });
}

export async function POST(req: NextRequest) {
  logApiRequest("orders/staff", "POST");
  try {
    const session = await requireSession(["OWNER", "MANAGER", "SERVER"]);
    if (!session || !canPlaceOfflineOrder(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tableId, customerName, items, openTable } = await req.json();

    if (!tableId || !items?.length) {
      return NextResponse.json({ error: "Table and items are required" }, { status: 400 });
    }

    if (openTable !== false) {
      await prisma.table.updateMany({
        where: { id: tableId, restaurantId: session.restaurantId },
        data: { orderingEnabled: true },
      });
    }

    const { order, total } = await createOrderForTable({
      tableId,
      restaurantId: session.restaurantId,
      customerName,
      items: items.map((item: { menuItemId: string; quantity: number; notes?: string }) => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        notes: item.notes,
      })),
    });

    logInfo("api:orders/staff", "Staff order created", {
      orderId: order.id,
      orderNumber: order.orderNumber,
      tableId: order.tableId,
      staffId: session.id,
      itemCount: order.items.length,
      total,
    });

    return NextResponse.json({ order: { ...order, total } }, { status: 201 });
  } catch (error) {
    if (error instanceof OrderCreationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    logApiError("orders/staff", "POST", error);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createOrderForTable, OrderCreationError } from "@/lib/order-service";
import { logApiError, logApiRequest, logInfo } from "@/lib/logger";
import { assertCustomerDiningAccess } from "@/lib/customer-dining-guard";
import { isTablePaymentBlocked } from "@/lib/payment-service";
import { todayDateString } from "@/lib/utils";
import { requireSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  logApiRequest("orders", "POST");
  try {
    const { tableToken, customerName, items, sessionKey } = await req.json();

    if (!tableToken || !items?.length) {
      return NextResponse.json({ error: "Invalid order data" }, { status: 400 });
    }

    if (!sessionKey) {
      return NextResponse.json({ error: "Table session required" }, { status: 403 });
    }

    const table = await prisma.table.findUnique({
      where: { qrToken: tableToken },
      include: { restaurant: true },
    });

    if (!table || !table.isActive) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    const { validateTableSession } = await import("@/lib/table-session-service");
    const sessionValid = await validateTableSession(table.id, sessionKey);
    if (!sessionValid) {
      return NextResponse.json(
        {
          error: `This table allows ${table.maxSessions} active ordering session(s). Please scan again when a slot opens.`,
        },
        { status: 403 },
      );
    }

    const dining = await assertCustomerDiningAccess(req, tableToken, sessionKey);
    if (!dining.ok) {
      return NextResponse.json(
        { error: dining.error, code: dining.code },
        { status: dining.status },
      );
    }

    const { order, total } = await createOrderForTable({
      tableId: table.id,
      restaurantId: table.restaurantId,
      customerName,
      items: items.map((item: { menuItemId: string; quantity: number; notes?: string }) => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        notes: item.notes,
      })),
    });

    logInfo("api:orders", "Order created", {
      orderId: order.id,
      orderNumber: order.orderNumber,
      tableId: order.tableId,
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
    logApiError("orders", "POST", error);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const tableToken = req.nextUrl.searchParams.get("tableToken");
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  logApiRequest("orders", "GET", {
    tableToken: tableToken ? "[present]" : null,
    restaurantId: restaurantId ? "[present]" : null,
  });

  if (tableToken) {
    const table = await prisma.table.findUnique({ where: { qrToken: tableToken } });
    if (!table) return NextResponse.json({ orders: [] });

    const sessionKey = req.nextUrl.searchParams.get("sessionKey");
    if (sessionKey) {
      const dining = await assertCustomerDiningAccess(req, tableToken, sessionKey);
      if (!dining.ok) {
        return NextResponse.json(
          { error: dining.error, code: dining.code, orders: [] },
          { status: dining.status },
        );
      }
    } else {
      return NextResponse.json(
        {
          error: "Scan the QR code at your table to view orders.",
          code: "DINING_CHECKIN_REQUIRED",
          orders: [],
        },
        { status: 403 },
      );
    }

    const orders = await prisma.order.findMany({
      where: {
        tableId: table.id,
        date: todayDateString(),
        status: { notIn: ["CANCELLED"] },
      },
      include: { items: { include: { menuItem: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      orders,
      paymentBlocked: await isTablePaymentBlocked(table.id),
    });
  }

  if (restaurantId) {
    const session = await requireSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (restaurantId !== session.restaurantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        date: todayDateString(),
        status: { notIn: ["SERVED", "CANCELLED"] },
      },
      include: {
        table: true,
        items: { include: { menuItem: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ orders });
  }

  return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
}

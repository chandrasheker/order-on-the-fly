import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getNextOrderNumber } from "@/lib/order-service";
import { isTablePaymentBlocked } from "@/lib/payment-service";
import { todayDateString } from "@/lib/utils";
import { logApiError, logApiRequest, logInfo } from "@/lib/logger";

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

    if (await isTablePaymentBlocked(table.id)) {
      return NextResponse.json(
        {
          error:
            "Please complete payment for your current bill before placing a new order. Ask staff if you need help.",
          code: "TABLE_PAYMENT_BLOCKED",
        },
        { status: 403 }
      );
    }

    const { validateTableSession } = await import("@/lib/table-session-service");
    const sessionValid = await validateTableSession(table.id, sessionKey);
    if (!sessionValid) {
      return NextResponse.json(
        {
          error: `This table allows ${table.maxSessions} active ordering session(s). Please scan again when a slot opens.`,
        },
        { status: 403 }
      );
    }

    const menuItems = await prisma.menuItem.findMany({
      where: {
        id: { in: items.map((i: { menuItemId: string }) => i.menuItemId) },
        isAvailable: true,
      },
    });

    if (menuItems.length !== items.length) {
      return NextResponse.json(
        { error: "Some items are unavailable" },
        { status: 400 }
      );
    }

    const orderNumber = await getNextOrderNumber(table.restaurantId);
    const now = new Date();

    const orderItemsData = items.map(
      (item: { menuItemId: string; quantity: number; notes?: string }) => {
        const menuItem = menuItems.find((m) => m.id === item.menuItemId)!;
        const expectedReadyAt = new Date(
          now.getTime() + menuItem.prepTimeMinutes * 60 * 1000
        );
        return {
          menuItemId: menuItem.id,
          quantity: item.quantity,
          prepTimeMinutes: menuItem.prepTimeMinutes,
          expectedReadyAt,
          unitPrice: menuItem.price,
          itemName: menuItem.name,
          notes: item.notes,
        };
      }
    );

    const order = await prisma.order.create({
      data: {
        orderNumber,
        customerName: customerName || null,
        tableId: table.id,
        restaurantId: table.restaurantId,
        date: todayDateString(),
        status: "PENDING",
        items: { create: orderItemsData },
      },
      include: {
        items: true,
        table: true,
      },
    });

    const total = order.items.reduce(
      (sum, i) => sum + i.unitPrice * i.quantity,
      0
    );

    logInfo("api:orders", "Order created", {
      orderId: order.id,
      orderNumber: order.orderNumber,
      tableId: order.tableId,
      itemCount: order.items.length,
      total,
    });

    return NextResponse.json({ order: { ...order, total } }, { status: 201 });
  } catch (error) {
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

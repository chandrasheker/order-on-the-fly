import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getNextOrderNumber } from "@/lib/order-service";
import { todayDateString } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const { tableToken, customerName, items } = await req.json();

    if (!tableToken || !items?.length) {
      return NextResponse.json({ error: "Invalid order data" }, { status: 400 });
    }

    const table = await prisma.table.findUnique({
      where: { qrToken: tableToken },
      include: { restaurant: true },
    });

    if (!table || !table.isActive) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
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

    return NextResponse.json({ order: { ...order, total } }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const tableToken = req.nextUrl.searchParams.get("tableToken");
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");

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
    return NextResponse.json({ orders });
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

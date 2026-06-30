import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createOrderForTable, OrderCreationError } from "@/lib/order-service";
import { canPlaceOfflineOrder } from "@/lib/staff-permissions";
import { prisma } from "@/lib/prisma";
import { logApiError, logApiRequest, logInfo } from "@/lib/logger";

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

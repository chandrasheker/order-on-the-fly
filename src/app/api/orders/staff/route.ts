import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createOrderForTable, getTodayOrdersByTable, OrderCreationError } from "@/lib/order-service";
import { createChannelOrder } from "@/lib/aggregator-order-service";
import { canPlaceOfflineOrder } from "@/lib/staff-permissions";
import { prisma } from "@/lib/prisma";
import { logApiError, logApiRequest, logInfo } from "@/lib/logger";
import { sumOrderRevenue, todayDateString } from "@/lib/utils";
import { featureDisabledResponse } from "@/lib/feature-guard";
import { buildKitchenChitPayload } from "@/lib/kitchen-chit-service";
import { ensureServiceTables } from "@/lib/service-tables";
import type { OrderChannel } from "@/generated/prisma/client";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

const REMOTE_CHANNELS: OrderChannel[] = ["TAKEAWAY", "DELIVERY"];

async function handleGET(req: NextRequest) {
  const session = await requireSession(["OWNER", "MANAGER", "SERVER"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const byTable = req.nextUrl.searchParams.get("byTable") === "1";
  if (byTable) {
    const tables = await getTodayOrdersByTable(session.restaurantId);
    return NextResponse.json({ tables });
  }

  if (!canPlaceOfflineOrder(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "phone_orders");
  if (blocked) return blocked;

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

export const GET = withForensicApiRoute(handleGET);

async function handlePOST(req: NextRequest) {
  logApiRequest("orders/staff", "POST");
  try {
    const session = await requireSession(["OWNER", "MANAGER", "SERVER"]);
    if (!session || !canPlaceOfflineOrder(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const blocked = await featureDisabledResponse(session.restaurantId, "phone_orders");
    if (blocked) return blocked;

    const body = await req.json();
    const channel = body.channel ? (String(body.channel).toUpperCase() as OrderChannel) : null;
    const items = body.items ?? [];

    if (channel && REMOTE_CHANNELS.includes(channel)) {
      await ensureServiceTables(session.restaurantId, session.restaurantSlug);
      const { order, total } = await createChannelOrder({
        restaurantId: session.restaurantId,
        restaurantSlug: session.restaurantSlug,
        channel,
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        externalOrderId: body.externalOrderId,
        orderNotes: body.orderNotes,
        items,
        placedByUserId: session.id,
        placedByName: session.name,
      });

      const kitchenChit = await buildKitchenChitPayload(order.id);

      return NextResponse.json(
        { order: { ...order, total }, kitchenChit },
        { status: 201 },
      );
    }

    const { tableId, customerName, openTable } = body;

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
      placedByUserId: session.id,
      placedByName: session.name,
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

    const kitchenChit = await buildKitchenChitPayload(order.id);

    return NextResponse.json({ order: { ...order, total }, kitchenChit }, { status: 201 });
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

export const POST = withForensicApiRoute(handlePOST);

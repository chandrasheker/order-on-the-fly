import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createOrderForTable, OrderCreationError } from "@/lib/order-service";
import { logApiError, logApiRequest, logInfo } from "@/lib/logger";
import { assertCustomerDiningAccess } from "@/lib/customer-dining-guard";
import { isTablePaymentBlocked } from "@/lib/payment-service";
import { getTableTabPaymentSummary } from "@/lib/table-tab-service";
import { todayDateString } from "@/lib/utils";
import { requireSession } from "@/lib/auth";
import { loadTableByQrForRequest, opaqueNotFoundJson, trustedRestaurantId, hostRestaurantId } from "@/platform/tenant-scope";
import { resolveTenantFromHost } from "@/platform/host-tenant";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handlePOST(req: NextRequest) {
  logApiRequest("orders", "POST");
  try {
    const { tableToken, customerName, items, comboMeals, promoCode, sessionKey } = await req.json();

    if (!tableToken || (!items?.length && !comboMeals?.length)) {
      return NextResponse.json({ error: "Invalid order data" }, { status: 400 });
    }

    if (!sessionKey) {
      return NextResponse.json({ error: "Table session required" }, { status: 403 });
    }

    const { table, resolution } = await loadTableByQrForRequest(req, tableToken);
    if (!resolution.ok || !table || !table.isActive) {
      return opaqueNotFoundJson();
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
      promoCode: promoCode ?? null,
      items: (items ?? []).map(
        (item: {
          menuItemId: string;
          quantity: number;
          notes?: string;
          modifierOptionIds?: string[];
        }) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          notes: item.notes,
          modifierOptionIds: item.modifierOptionIds,
        }),
      ),
      comboMeals: (comboMeals ?? []).map(
        (c: { comboMealId: string; quantity: number }) => ({
          comboMealId: c.comboMealId,
          quantity: Number(c.quantity ?? 1),
        }),
      ),
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

export const POST = withForensicApiRoute(handlePOST);

async function handleGET(req: NextRequest) {
  const tableToken = req.nextUrl.searchParams.get("tableToken");
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  logApiRequest("orders", "GET", {
    tableToken: tableToken ? "[present]" : null,
    restaurantId: restaurantId ? "[present]" : null,
  });

  if (tableToken) {
    const { table, resolution } = await loadTableByQrForRequest(req, tableToken);
    if (!resolution.ok || !table) return opaqueNotFoundJson();

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

    const { getTableTabOrders } = await import("@/lib/table-tab-service");
    const orders = await getTableTabOrders(table.id);
    const ordersWithMenu = await prisma.order.findMany({
      where: { id: { in: orders.map((order) => order.id) } },
      include: { items: { include: { menuItem: true } } },
      orderBy: { createdAt: "desc" },
    });
    const tabSummary = await getTableTabPaymentSummary(table.id);
    const { ensureBillPublicToken } = await import("@/lib/public-receipt-service");
    const bills = await prisma.bill.findMany({
      where: {
        restaurantId: table.restaurantId,
        orderId: { in: ordersWithMenu.map((order) => order.id) },
        status: "FINALIZED",
      },
      select: { id: true, orderId: true, publicToken: true },
    });
    const receiptByOrder = new Map<string, string>();
    for (const bill of bills) {
      const token = bill.publicToken || (await ensureBillPublicToken(bill.id));
      if (token) receiptByOrder.set(bill.orderId, `/receipt/${token}`);
    }
    return NextResponse.json({
      orders: ordersWithMenu.map((order) => ({
        ...order,
        receiptUrl: receiptByOrder.get(order.id) ?? null,
      })),
      paymentBlocked: await isTablePaymentBlocked(table.id),
      tabPaymentPending: tabSummary.paymentRequested,
      tabSummary: {
        billTotal: tabSummary.billTotal,
        paidTotal: tabSummary.paidTotal,
        remaining: tabSummary.remaining,
        paymentRequested: tabSummary.paymentRequested,
        orderCount: tabSummary.orderCount,
      },
    });
  }

  if (restaurantId) {
    const session = await requireSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const host = await resolveTenantFromHost(req);
    if (!host.ok) return opaqueNotFoundJson();
    const scopedRestaurantId = trustedRestaurantId(hostRestaurantId(host), restaurantId);
    if (!scopedRestaurantId || scopedRestaurantId !== session.restaurantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const orders = await prisma.order.findMany({
      where: {
        restaurantId: scopedRestaurantId,
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

export const GET = withForensicApiRoute(handleGET);

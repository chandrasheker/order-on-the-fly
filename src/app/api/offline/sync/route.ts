import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createOrderForTable, OrderCreationError } from "@/lib/order-service";
import { createChannelOrder } from "@/lib/aggregator-order-service";
import { prisma } from "@/lib/prisma";
import { tenantContextFromSession } from "@/platform/tenant-context";
import type { OrderChannel } from "@/generated/prisma/client";

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const clientId = String(body.clientId ?? "");
  if (!clientId) {
    return NextResponse.json({ error: "clientId required for offline sync" }, { status: 400 });
  }

  const existing = await prisma.backgroundJob.findFirst({
    where: {
      type: "offline_order_sync",
      restaurantId: session.restaurantId,
      payload: { contains: `"clientId":"${clientId}"` },
      status: "COMPLETED",
    },
  });
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const ctx = await tenantContextFromSession(session);

  try {
    const kind = String(body.kind ?? "table");
    let order;
    let total = 0;

    if (kind === "takeaway" || kind === "delivery" || body.channel) {
      const channel = String(body.channel ?? kind).toUpperCase() as OrderChannel;
      const result = await createChannelOrder({
        restaurantId: session.restaurantId,
        restaurantSlug: ctx.restaurantSlug,
        channel,
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        orderNotes: body.orderNotes,
        items: body.items ?? [],
        placedByUserId: session.id,
        placedByName: session.name,
      });
      order = result.order;
      total = result.total;
    } else {
      const tableId = body.tableId as string;
      if (!tableId) throw new OrderCreationError("tableId required");

      const result = await createOrderForTable({
        tableId,
        restaurantId: session.restaurantId,
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        items: body.items ?? [],
        comboMeals: body.comboMeals,
        promoCode: body.promoCode,
        placedByUserId: session.id,
        placedByName: session.name,
      });
      order = result.order;
      total = result.total;
    }

    await prisma.backgroundJob.create({
      data: {
        type: "offline_order_sync",
        payload: JSON.stringify({ clientId, orderId: order.id }),
        status: "COMPLETED",
        processedAt: new Date(),
        restaurantId: session.restaurantId,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
      },
    });

    return NextResponse.json({ ok: true, order: { ...order, total } }, { status: 201 });
  } catch (error) {
    if (error instanceof OrderCreationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}

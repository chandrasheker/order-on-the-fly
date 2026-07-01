import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createOrderForTable, OrderCreationError } from "@/lib/order-service";
import { prisma } from "@/lib/prisma";

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
      payload: { contains: `"clientId":"${clientId}"` },
      status: "COMPLETED",
    },
  });
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    const tableId = body.tableId as string;
    if (!tableId) throw new OrderCreationError("tableId required");

    const { order, total } = await createOrderForTable({
      tableId,
      restaurantId: session.restaurantId,
      customerName: body.customerName,
      items: body.items ?? [],
      comboMeals: body.comboMeals,
      promoCode: body.promoCode,
      placedByUserId: session.id,
      placedByName: session.name,
    });

    await prisma.backgroundJob.create({
      data: {
        type: "offline_order_sync",
        payload: JSON.stringify({ clientId, orderId: order.id }),
        status: "COMPLETED",
        processedAt: new Date(),
        restaurantId: session.restaurantId,
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

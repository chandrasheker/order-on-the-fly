import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { logApiRequest, logInfo } from "@/lib/logger";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { action, itemId } = await req.json();
  logApiRequest("orders/[id]", "PATCH", { orderId: id, action, itemId });

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true, table: true },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (action === "alarm") {
    await prisma.order.update({
      where: { id },
      data: { alarmTriggered: true },
    });

    await prisma.alert.create({
      data: {
        type: "ALARM",
        message: `Table ${order.table.number} needs help! Order #${order.orderNumber}`,
        orderId: id,
        tableNumber: order.table.number,
        restaurantId: order.restaurantId,
      },
    });

    logInfo("api:orders/[id]", "Customer alarm triggered", {
      orderId: id,
      orderNumber: order.orderNumber,
      tableNumber: order.table.number,
    });

    return NextResponse.json({ success: true });
  }

  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (order.restaurantId !== session.restaurantId) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (action === "serve-item" && itemId) {
    await prisma.orderItem.update({
      where: { id: itemId },
      data: { status: "SERVED", servedAt: new Date(), isOverdue: false },
    });

    const remaining = await prisma.orderItem.count({
      where: { orderId: id, status: { not: "SERVED" } },
    });

    if (remaining === 0) {
      await prisma.order.update({
        where: { id },
        data: { status: "SERVED" },
      });
    } else {
      const readyCount = await prisma.orderItem.count({
        where: { orderId: id, status: "READY" },
      });
      const preparingCount = await prisma.orderItem.count({
        where: { orderId: id, status: "PREPARING" },
      });
      let status = "PREPARING";
      if (readyCount > 0) status = "READY";
      else if (preparingCount > 0) status = "PREPARING";
      await prisma.order.update({
        where: { id },
        data: { status: status as "PREPARING" | "READY" },
      });
    }

    logInfo("api:orders/[id]", "Item served", { orderId: id, itemId });
    return NextResponse.json({ success: true });
  }

  if (action === "prepare-item" && itemId) {
    await prisma.orderItem.update({
      where: { id: itemId },
      data: { status: "PREPARING" },
    });
    await prisma.order.update({ where: { id }, data: { status: "PREPARING" } });
    return NextResponse.json({ success: true });
  }

  if (action === "ready-item" && itemId) {
    await prisma.orderItem.update({
      where: { id: itemId },
      data: { status: "READY" },
    });
    await prisma.order.update({ where: { id }, data: { status: "READY" } });
    return NextResponse.json({ success: true });
  }

  if (action === "serve-all") {
    await prisma.orderItem.updateMany({
      where: { orderId: id },
      data: { status: "SERVED", servedAt: new Date(), isOverdue: false },
    });
    await prisma.order.update({ where: { id }, data: { status: "SERVED" } });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

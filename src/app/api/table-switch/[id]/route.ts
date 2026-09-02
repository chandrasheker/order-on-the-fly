import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { todayDateString } from "@/lib/utils";
import { closeTableOrdering, openTableOrdering } from "@/lib/table-ordering-service";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession(["OWNER", "MANAGER", "SERVER"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { action } = await req.json();

  const switchRequest = await prisma.tableSwitchRequest.findFirst({
    where: { id, restaurantId: session.restaurantId },
    include: {
      sourceTable: true,
      targetTable: true,
    },
  });

  if (!switchRequest) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  if (switchRequest.status !== "PENDING") {
    return NextResponse.json({ error: "Request is already handled" }, { status: 400 });
  }

  if (action === "reject") {
    await prisma.tableSwitchRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        respondedAt: new Date(),
        approvedByUserId: session.id,
        approvedByName: session.name,
      },
    });
    return NextResponse.json({ success: true, status: "REJECTED" });
  }

  if (action !== "approve") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  if (!switchRequest.targetTable.isActive) {
    return NextResponse.json({ error: "Target table is inactive" }, { status: 400 });
  }

  const movableOrders = await prisma.order.findMany({
    where: {
      tableId: switchRequest.sourceTableId,
      restaurantId: session.restaurantId,
      date: todayDateString(),
      status: { not: "CANCELLED" },
      OR: [{ status: { not: "SERVED" } }, { paidAt: null }],
    },
    select: { id: true },
  });

  if (movableOrders.length === 0) {
    await prisma.tableSwitchRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        respondedAt: new Date(),
        approvedByUserId: session.id,
        approvedByName: session.name,
        note: switchRequest.note
          ? `${switchRequest.note}\nNo active orders remained when staff reviewed.`
          : "No active orders remained when staff reviewed.",
      },
    });
    return NextResponse.json({ error: "No active orders remain to move" }, { status: 400 });
  }

  const orderIds = movableOrders.map((order) => order.id);

  await prisma.$transaction(async (tx) => {
    await tx.order.updateMany({
      where: { id: { in: orderIds } },
      data: { tableId: switchRequest.targetTableId },
    });

    await tx.payment.updateMany({
      where: { orderId: { in: orderIds } },
      data: { tableId: switchRequest.targetTableId },
    });

    await tx.alert.updateMany({
      where: {
        restaurantId: session.restaurantId,
        orderId: { in: orderIds },
        isRead: false,
      },
      data: { tableNumber: switchRequest.targetTableNumber },
    });

    await tx.tableSwitchRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        respondedAt: new Date(),
        approvedByUserId: session.id,
        approvedByName: session.name,
      },
    });

    await tx.alert.create({
      data: {
        type: "TABLE_SWITCH",
        message: `Approved table switch: Table ${switchRequest.sourceTableNumber} → Table ${switchRequest.targetTableNumber}`,
        tableNumber: switchRequest.targetTableNumber,
        restaurantId: session.restaurantId,
      },
    });
  });

  await openTableOrdering(switchRequest.targetTableId);
  await closeTableOrdering(switchRequest.sourceTableId);

  return NextResponse.json({
    success: true,
    status: "APPROVED",
    movedOrderCount: movableOrders.length,
    targetTableNumber: switchRequest.targetTableNumber,
  });
}

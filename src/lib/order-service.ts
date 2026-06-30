import { prisma } from "@/lib/prisma";
import { isOrderItemOpen, todayDateString, sumOrderRevenue } from "@/lib/utils";
import { clearPaymentAlerts } from "@/lib/payment-service";
import { maybeAutoCloseTableAfterPayment } from "@/lib/table-ordering-service";
import { finalizeOrderIfSettled } from "@/lib/payment-allocation-service";
import { channelForTableKind, isServiceTable } from "@/lib/order-channel";
import type { OrderChannel } from "@/generated/prisma/client";

export async function clearAlertsForOrderItem(orderItemId: string) {
  await prisma.alert.updateMany({
    where: { orderItemId, isRead: false },
    data: { isRead: true },
  });
}

export async function autoCompleteZeroBillOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order || order.status !== "SERVED" || order.paidAt) return;

  const billTotal = sumOrderRevenue(order.items);
  if (billTotal === 0) {
    await prisma.order.update({
      where: { id: orderId },
      data: { paidAt: new Date() },
    });
    await clearPaymentAlerts(orderId);
    const orderRow = await prisma.order.findUnique({
      where: { id: orderId },
      select: { tableId: true },
    });
    if (orderRow) await maybeAutoCloseTableAfterPayment(orderRow.tableId);
  }
}

export async function syncOrderStatus(orderId: string) {
  const items = await prisma.orderItem.findMany({ where: { orderId } });
  const openItems = items.filter((i) => isOrderItemOpen(i.status));

  if (openItems.length === 0) {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: "SERVED" },
    });
    await autoCompleteZeroBillOrder(orderId);
    await finalizeOrderIfSettled(orderId);
    return;
  }

  const readyCount = openItems.filter((i) => i.status === "READY").length;
  const preparingCount = openItems.filter((i) => i.status === "PREPARING").length;
  let status: "PENDING" | "PREPARING" | "READY" = "PENDING";
  if (readyCount > 0) status = "READY";
  else if (preparingCount > 0) status = "PREPARING";

  await prisma.order.update({
    where: { id: orderId },
    data: { status },
  });
}

export function minutesLateFromExpected(expectedReadyAt: Date, at = new Date()) {
  const diffMs = at.getTime() - expectedReadyAt.getTime();
  return diffMs > 0 ? Math.ceil(diffMs / 60000) : 0;
}

export function serveTimelineUpdate(
  expectedReadyAt: Date,
  servedAt = new Date(),
  existing?: { missedTimeline?: boolean; minutesLate?: number | null }
) {
  const late = minutesLateFromExpected(expectedReadyAt, servedAt);
  if (late <= 0 && !existing?.missedTimeline) {
    return { isOverdue: false, missedTimeline: false, minutesLate: null as number | null };
  }
  const minutesLate = Math.max(late, existing?.minutesLate ?? 0);
  return {
    isOverdue: false,
    missedTimeline: true,
    minutesLate: minutesLate > 0 ? minutesLate : existing?.minutesLate ?? null,
  };
}

export async function getNextOrderNumber(restaurantId: string) {
  const today = todayDateString();
  const last = await prisma.order.findFirst({
    where: { restaurantId, date: today },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  return (last?.orderNumber ?? 0) + 1;
}

export type CreateOrderItemInput = {
  menuItemId: string;
  quantity: number;
  notes?: string;
};

export class OrderCreationError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function createOrderForTable(params: {
  tableId: string;
  restaurantId: string;
  customerName?: string | null;
  customerPhone?: string | null;
  orderChannel?: OrderChannel;
  externalOrderId?: string | null;
  orderNotes?: string | null;
  items: CreateOrderItemInput[];
  placedByUserId?: string | null;
  placedByName?: string | null;
}) {
  const {
    tableId,
    restaurantId,
    customerName,
    customerPhone,
    orderChannel,
    externalOrderId,
    orderNotes,
    items,
    placedByUserId,
    placedByName,
  } = params;

  if (!items.length) {
    throw new OrderCreationError("Order must include at least one item");
  }

  const table = await prisma.table.findFirst({
    where: { id: tableId, restaurantId, isActive: true },
    include: { restaurant: true },
  });

  if (!table) {
    throw new OrderCreationError("Table not found", 404);
  }

  const { isTablePaymentBlocked } = await import("@/lib/payment-service");
  if (!isServiceTable(table.kind) && (await isTablePaymentBlocked(table.id))) {
    throw new OrderCreationError(
      "This table has an unpaid bill. Collect payment before placing a new order.",
      403,
      "TABLE_PAYMENT_BLOCKED",
    );
  }

  const resolvedChannel =
    orderChannel ??
    (placedByUserId
      ? table.kind === "DINE_IN"
        ? "WALK_IN"
        : channelForTableKind(table.kind, table.serviceLabel)
      : channelForTableKind(table.kind, table.serviceLabel));

  const menuItems = await prisma.menuItem.findMany({
    where: {
      id: { in: items.map((i) => i.menuItemId) },
      isAvailable: true,
      category: { restaurantId },
    },
  });

  if (menuItems.length !== items.length) {
    throw new OrderCreationError("Some items are unavailable", 400);
  }

  const orderNumber = await getNextOrderNumber(restaurantId);
  const now = new Date();

  const orderItemsData = items.map((item) => {
    const menuItem = menuItems.find((m) => m.id === item.menuItemId)!;
    const expectedReadyAt = new Date(now.getTime() + menuItem.prepTimeMinutes * 60 * 1000);
    return {
      menuItemId: menuItem.id,
      quantity: item.quantity,
      prepTimeMinutes: menuItem.prepTimeMinutes,
      expectedReadyAt,
      unitPrice: menuItem.price,
      itemName: menuItem.name,
      notes: item.notes,
    };
  });

  const order = await prisma.order.create({
    data: {
      orderNumber,
      customerName: customerName?.trim() || null,
      customerPhone: customerPhone?.trim() || null,
      orderChannel: resolvedChannel,
      externalOrderId: externalOrderId?.trim() || null,
      orderNotes: orderNotes?.trim() || null,
      tableId: table.id,
      restaurantId: table.restaurantId,
      date: todayDateString(),
      status: "PENDING",
      placedByUserId: placedByUserId ?? null,
      placedByName: placedByName ?? null,
      items: { create: orderItemsData },
    },
    include: {
      items: true,
      table: true,
    },
  });

  const total = order.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  return { order, total };
}

export async function checkOverdueItems(restaurantId: string) {
  const now = new Date();
  const overdueItems = await prisma.orderItem.findMany({
    where: {
      isOverdue: false,
      servedAt: null,
      status: { notIn: ["SERVED", "UNAVAILABLE"] },
      expectedReadyAt: { lt: now },
      order: { restaurantId, status: { not: "SERVED" } },
    },
    include: {
      order: { include: { table: true } },
    },
  });

  for (const item of overdueItems) {
    const minutesLate = minutesLateFromExpected(item.expectedReadyAt, now);
    await prisma.orderItem.update({
      where: { id: item.id },
      data: {
        isOverdue: true,
        missedTimeline: true,
        minutesLate,
      },
    });

    const existing = await prisma.alert.findFirst({
      where: {
        orderItemId: item.id,
        type: "OVERDUE",
        isRead: false,
      },
    });

    if (!existing) {
      await prisma.alert.create({
        data: {
          type: "OVERDUE",
          message: `Table ${item.order.table.number}: ${item.itemName} is overdue! Expected ${item.prepTimeMinutes} min.`,
          orderId: item.orderId,
          orderItemId: item.id,
          tableNumber: item.order.table.number,
          restaurantId,
        },
      });
    }
  }

  return overdueItems.length;
}

export async function getActiveOrders(restaurantId: string) {
  await checkOverdueItems(restaurantId);

  return prisma.order.findMany({
    where: {
      restaurantId,
      date: todayDateString(),
      status: { notIn: ["SERVED", "CANCELLED"] },
    },
    include: {
      table: true,
      items: {
        include: { menuItem: { include: { category: true } } },
        orderBy: { expectedReadyAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getTodayOrders(restaurantId: string) {
  return prisma.order.findMany({
    where: { restaurantId, date: todayDateString() },
    include: {
      table: true,
      items: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPendingPaymentOrders(restaurantId: string) {
  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      date: todayDateString(),
      status: "SERVED",
      paidAt: null,
    },
    include: {
      table: true,
      items: {
        include: { menuItem: { include: { category: true } } },
        orderBy: { expectedReadyAt: "asc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  for (const order of orders) {
    if (sumOrderRevenue(order.items) === 0) {
      await autoCompleteZeroBillOrder(order.id);
    }
  }

  return orders.filter((o) => sumOrderRevenue(o.items) > 0);
}

export async function getCompletedOrders(restaurantId: string) {
  return prisma.order.findMany({
    where: {
      restaurantId,
      date: todayDateString(),
      status: "SERVED",
      paidAt: { not: null },
    },
    include: {
      table: true,
      items: true,
    },
    orderBy: { paidAt: "desc" },
  });
}

export async function getMissedTimelineItems(restaurantId: string) {
  await checkOverdueItems(restaurantId);

  const items = await prisma.orderItem.findMany({
    where: {
      missedTimeline: true,
      order: { restaurantId, date: todayDateString() },
    },
    include: {
      order: { include: { table: true } },
      menuItem: { select: { id: true, prepTimeMinutes: true } },
    },
    orderBy: { expectedReadyAt: "desc" },
  });

  const summaryMap = new Map<
    string,
    { itemName: string; count: number; totalMinutesLate: number; prepTimeMinutes: number }
  >();

  for (const item of items) {
    const existing = summaryMap.get(item.itemName);
    const late = item.minutesLate ?? 0;
    if (existing) {
      existing.count += 1;
      existing.totalMinutesLate += late;
    } else {
      summaryMap.set(item.itemName, {
        itemName: item.itemName,
        count: 1,
        totalMinutesLate: late,
        prepTimeMinutes: item.prepTimeMinutes,
      });
    }
  }

  const summary = Array.from(summaryMap.values())
    .map((s) => ({
      ...s,
      avgMinutesLate: s.count > 0 ? Math.round(s.totalMinutesLate / s.count) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return { items, summary };
}

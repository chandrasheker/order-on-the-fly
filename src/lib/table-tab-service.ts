import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { todayDateString, sumOrderRevenue } from "@/lib/utils";
import { getOrderPaymentSummaries } from "@/lib/payment-allocation-service";

function todayTableOrdersWhere(tableId: string) {
  return {
    tableId,
    date: todayDateString(),
    status: { not: "CANCELLED" as const },
  };
}

async function getOpenVisitOrders(tableId: string) {
  return prisma.order.findMany({
    where: todayTableOrdersWhere(tableId),
    include: { items: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function ensureTableTabId(tableId: string): Promise<string> {
  const table = await prisma.table.findUnique({
    where: { id: tableId },
    select: { currentTabId: true },
  });
  if (table?.currentTabId) return table.currentTabId;

  const unsettled = await prisma.order.findFirst({
    where: {
      ...todayTableOrdersWhere(tableId),
      paidAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: { tabId: true },
  });
  if (unsettled?.tabId) {
    await prisma.table.update({
      where: { id: tableId },
      data: { currentTabId: unsettled.tabId },
    });
    return unsettled.tabId;
  }

  const tabId = randomUUID();
  await prisma.table.update({
    where: { id: tableId },
    data: { currentTabId: tabId },
  });
  return tabId;
}

/** Keep all open-visit orders on the same tab id (multi-round until payment). */
export async function syncOpenVisitTabIds(tableId: string) {
  const tabId = await ensureTableTabId(tableId);
  await prisma.order.updateMany({
    where: {
      ...todayTableOrdersWhere(tableId),
      paidAt: null,
    },
    data: { tabId },
  });
  return tabId;
}

export async function getTableTabOrders(tableId: string) {
  if (!(await isTabFullySettled(tableId))) {
    await syncOpenVisitTabIds(tableId);
    return getOpenVisitOrders(tableId);
  }

  const table = await prisma.table.findUnique({
    where: { id: tableId },
    select: { currentTabId: true },
  });
  if (!table?.currentTabId) return [];

  return prisma.order.findMany({
    where: {
      ...todayTableOrdersWhere(tableId),
      tabId: table.currentTabId,
    },
    include: { items: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function getTableTabPaymentSummary(tableId: string) {
  const orders = await getTableTabOrders(tableId);
  const servedOrders = orders.filter((o) => o.status === "SERVED");
  const summaries = await getOrderPaymentSummaries(servedOrders.map((o) => o.id));

  let billTotal = 0;
  let paidTotal = 0;
  let remaining = 0;
  const unpaidOrderIds: string[] = [];

  for (const order of servedOrders) {
    const summary = summaries.get(order.id);
    if (!summary) continue;
    billTotal += summary.total;
    paidTotal += summary.paid;
    remaining += summary.remaining;
    if (summary.remaining > 0.01) unpaidOrderIds.push(order.id);
  }

  const table = await prisma.table.findUnique({
    where: { id: tableId },
    select: { tabPaymentRequestedAt: true },
  });

  return {
    billTotal,
    paidTotal,
    remaining: Math.max(0, remaining),
    unpaidOrderIds,
    paymentRequested: Boolean(table?.tabPaymentRequestedAt && remaining > 0.01),
    tabPaymentRequestedAt: table?.tabPaymentRequestedAt ?? null,
    orderCount: orders.length,
    servedOrderCount: servedOrders.length,
  };
}

export async function isTabFullySettled(tableId: string) {
  const orders = await getOpenVisitOrders(tableId);
  const openKitchen = orders.some((o) => o.status !== "SERVED" && o.status !== "CANCELLED");
  if (openKitchen) return false;

  const draftCount = await prisma.tableCartDraft.count({ where: { tableId } });
  if (draftCount > 0) return false;

  const servedOrders = orders.filter((o) => o.status === "SERVED");
  if (servedOrders.length === 0) return orders.length === 0;

  const summaries = await getOrderPaymentSummaries(servedOrders.map((o) => o.id));
  let remaining = 0;
  for (const order of servedOrders) {
    const summary = summaries.get(order.id);
    if (summary) remaining += summary.remaining;
  }
  return remaining <= 0.01;
}

export async function clearTableTabFlags(tableId: string) {
  await prisma.table.update({
    where: { id: tableId },
    data: {
      currentTabId: null,
      tabPaymentRequestedAt: null,
    },
  });
}

export async function clearTabPaymentRequestIfSettled(tableId: string) {
  if (!(await isTabFullySettled(tableId))) return false;
  await prisma.table.update({
    where: { id: tableId },
    data: { tabPaymentRequestedAt: null },
  });
  return true;
}

export async function assignOrderToTableTab(orderId: string, tableId: string) {
  const tabId = await syncOpenVisitTabIds(tableId);
  await prisma.order.update({
    where: { id: orderId },
    data: { tabId },
  });
  return tabId;
}

export function tabBillTotalFromOrders(
  orders: Array<{ status: string; items: Array<{ unitPrice: number; quantity: number; status: string }> }>,
) {
  return orders
    .filter((o) => o.status === "SERVED")
    .reduce((sum, order) => sum + sumOrderRevenue(order.items), 0);
}

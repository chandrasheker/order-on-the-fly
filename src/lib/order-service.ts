import { prisma } from "@/lib/prisma";
import { isOrderItemOpen, todayDateString, sumOrderRevenue } from "@/lib/utils";
import { maybeAutoPauseKitchen } from "@/lib/kitchen-capacity-service";
import { clearPaymentAlerts } from "@/lib/payment-service";
import { maybeAutoCloseTableAfterPayment } from "@/lib/table-ordering-service";
import { finalizeOrderIfSettled } from "@/lib/payment-allocation-service";
import { channelForTableKind } from "@/lib/order-channel";
import { scheduleAggregatorStatusPush } from "@/lib/aggregator-sync-service";
import { decrementInventoryForOrder } from "@/lib/inventory-service";
import { touchGuestProfile } from "@/lib/guest-crm-service";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { assertKitchenAcceptingOrders } from "@/lib/kitchen-capacity-service";
import {
  validateAndPriceModifiers,
  modifiersToJson,
  formatModifiersNotes,
} from "@/lib/modifier-service";
import { resolvePromotionForOrder } from "@/lib/promotion-service";
import { resolveHierarchyForTable } from "@/domains/tables/floor-hierarchy";
import { emitOrderCreated } from "@/platform/event-bus";
import { enqueueJob } from "@/lib/job-queue";
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
    scheduleAggregatorStatusPush(orderId);
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

  if (status === "READY") {
    scheduleAggregatorStatusPush(orderId);
  }
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
  modifierOptionIds?: string[];
};

export type CreateComboMealInput = {
  comboMealId: string;
  quantity: number;
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
  comboMeals?: CreateComboMealInput[];
  placedByUserId?: string | null;
  placedByName?: string | null;
  promoCode?: string | null;
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
    comboMeals = [],
    placedByUserId,
    placedByName,
    promoCode,
  } = params;

  if (!items.length && !comboMeals.length) {
    throw new OrderCreationError("Order must include at least one item");
  }

  const table = await prisma.table.findFirst({
    where: { id: tableId, restaurantId, isActive: true },
    include: { restaurant: true },
  });

  if (!table) {
    throw new OrderCreationError("Table not found", 404);
  }

  if (!placedByUserId) {
    const kitchen = await assertKitchenAcceptingOrders(restaurantId);
    if (!kitchen.ok) {
      throw new OrderCreationError(kitchen.error, 503, kitchen.code);
    }
  }

  const { ensureTableTabId } = await import("@/lib/table-tab-service");
  const tabId = await ensureTableTabId(table.id);

  const resolvedChannel =
    orderChannel ??
    (placedByUserId
      ? table.kind === "DINE_IN"
        ? "WALK_IN"
        : channelForTableKind(table.kind, table.serviceLabel)
      : channelForTableKind(table.kind, table.serviceLabel));

  const comboRows =
    comboMeals.length > 0
      ? await prisma.comboMeal.findMany({
          where: {
            id: { in: comboMeals.map((c) => c.comboMealId) },
            restaurantId,
            isAvailable: true,
          },
          include: {
            items: { include: { menuItem: { include: { category: { select: { slug: true } } } } } },
          },
        })
      : [];

  if (comboRows.length !== comboMeals.length) {
    throw new OrderCreationError("Some combo meals are unavailable", 400);
  }

  const comboDerivedItems: CreateOrderItemInput[] = [];
  for (const comboInput of comboMeals) {
    const combo = comboRows.find((c) => c.id === comboInput.comboMealId)!;
    const listTotal = combo.items.reduce(
      (s, i) => s + i.menuItem.price * i.quantity,
      0,
    );
    const ratio = listTotal > 0 ? combo.comboPrice / listTotal : 1;
    for (const ci of combo.items) {
      if (!ci.menuItem.isAvailable) {
        throw new OrderCreationError(`${combo.name}: ${ci.menuItem.name} is unavailable`, 400);
      }
      comboDerivedItems.push({
        menuItemId: ci.menuItemId,
        quantity: ci.quantity * comboInput.quantity,
        notes: `Combo: ${combo.name}`,
        modifierOptionIds: [],
      });
    }
  }

  const allItems = [...items, ...comboDerivedItems];

  const menuItems = await prisma.menuItem.findMany({
    where: {
      id: { in: allItems.map((i) => i.menuItemId) },
      isAvailable: true,
      category: { restaurantId },
    },
    include: { category: { select: { slug: true } } },
  });

  if (menuItems.length !== new Set(allItems.map((i) => i.menuItemId)).size) {
    throw new OrderCreationError("Some items are unavailable", 400);
  }

  const inventoryOn = await isFeatureEnabled(restaurantId, "inventory_86");
  if (inventoryOn) {
    for (const item of allItems) {
      const menuItem = menuItems.find((m) => m.id === item.menuItemId)!;
      if (menuItem.trackInventory && menuItem.stockQuantity != null) {
        if (menuItem.stockQuantity < item.quantity) {
          throw new OrderCreationError(
            `${menuItem.name} is out of stock (${menuItem.stockQuantity} left)`,
            400,
            "OUT_OF_STOCK",
          );
        }
      }
    }
  }

  const orderNumber = await getNextOrderNumber(restaurantId);
  const now = new Date();

  const pricedLines: Array<{
    menuItem: (typeof menuItems)[number];
    quantity: number;
    unitPrice: number;
    notes: string | null;
    modifiersJson: string | null;
  }> = [];

  for (const item of allItems) {
    const menuItem = menuItems.find((m) => m.id === item.menuItemId)!;
    const { modifiers, extraTotal } = await validateAndPriceModifiers(
      restaurantId,
      menuItem.id,
      item.modifierOptionIds ?? [],
    );
    const modNotes = formatModifiersNotes(modifiers);
    const combinedNotes = [item.notes?.trim(), modNotes].filter(Boolean).join(" · ") || null;
    pricedLines.push({
      menuItem,
      quantity: item.quantity,
      unitPrice: menuItem.price + extraTotal,
      notes: combinedNotes,
      modifiersJson: modifiersToJson(modifiers),
    });
  }

  let comboDiscount = 0;
  for (const comboInput of comboMeals) {
    const combo = comboRows.find((c) => c.id === comboInput.comboMealId)!;
    const listTotal = combo.items.reduce((s, ci) => {
      const line = pricedLines.find(
        (l) => l.menuItem.id === ci.menuItemId && l.notes?.includes(`Combo: ${combo.name}`),
      );
      const unit = line?.unitPrice ?? ci.menuItem.price;
      return s + unit * ci.quantity * comboInput.quantity;
    }, 0);
    const targetTotal = combo.comboPrice * comboInput.quantity;
    comboDiscount += Math.max(0, listTotal - targetTotal);
  }

  const promoLines = pricedLines.map((line) => ({
    menuItemId: line.menuItem.id,
    categorySlug: line.menuItem.category.slug,
    quantity: line.quantity,
    lineTotal: line.unitPrice * line.quantity,
  }));

  const { promo, discount: promoDiscountRaw } = await resolvePromotionForOrder({
    restaurantId,
    promoCode,
    lines: promoLines,
  });
  const promoDiscount = promoDiscountRaw + comboDiscount;

  const orderItemsData = pricedLines.map((line) => {
    const expectedReadyAt = new Date(now.getTime() + line.menuItem.prepTimeMinutes * 60 * 1000);
    return {
      menuItemId: line.menuItem.id,
      quantity: line.quantity,
      prepTimeMinutes: line.menuItem.prepTimeMinutes,
      expectedReadyAt,
      unitPrice: line.unitPrice,
      itemName: line.menuItem.name,
      notes: line.notes,
      modifiersJson: line.modifiersJson,
    };
  });

  const hierarchy = await resolveHierarchyForTable(table.id);

  const order = await prisma.order.create({
    data: {
      orderNumber,
      customerName: customerName?.trim() || null,
      customerPhone: customerPhone?.trim() || null,
      orderChannel: resolvedChannel,
      externalOrderId: externalOrderId?.trim() || null,
      orderNotes: orderNotes?.trim() || null,
      tableId: table.id,
      tabId,
      restaurantId: table.restaurantId,
      tenantId: hierarchy.tenantId,
      branchId: hierarchy.branchId,
      floorId: hierarchy.floorId,
      date: todayDateString(),
      status: "PENDING",
      placedByUserId: placedByUserId ?? null,
      placedByName: placedByName ?? null,
      promoCode: promo?.code ?? null,
      promoDiscount,
      discountAmount: promoDiscount,
      items: { create: orderItemsData },
    },
    include: {
      items: true,
      table: true,
    },
  });

  const total = Math.max(
    0,
    order.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0) - promoDiscount,
  );

  void decrementInventoryForOrder(
    table.restaurantId,
    allItems.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity }))
  );

  void enqueueJob({
    type: "recipe_deduct",
    restaurantId: table.restaurantId,
    payload: {
      restaurantId: table.restaurantId,
      items: allItems.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
    },
  });

  void touchGuestProfile({
    restaurantId: table.restaurantId,
    phone: customerPhone,
    name: customerName,
    orderTotal: total,
  });

  void emitOrderCreated({
    restaurantId: table.restaurantId,
    tenantId: hierarchy.tenantId,
    branchId: hierarchy.branchId,
    floorId: hierarchy.floorId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    total,
    tableNumber: table.number,
  });

  const { clearTableCartDraft } = await import("@/lib/table-cart-draft-service");
  await clearTableCartDraft({
    tableId: table.id,
    source: placedByUserId ? "STAFF" : "CUSTOMER",
  });

  return { order, total };
}

/** Throttle overdue scans — dashboard polls frequently. */
const overdueLastRun = new Map<string, number>();
const OVERDUE_CHECK_MS = 15_000;

export async function checkOverdueItems(restaurantId: string, force = false) {
  const nowMs = Date.now();
  const last = overdueLastRun.get(restaurantId) ?? 0;
  if (!force && nowMs - last < OVERDUE_CHECK_MS) {
    return 0;
  }
  overdueLastRun.set(restaurantId, nowMs);

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

  if (overdueItems.length > 0) {
    void maybeAutoPauseKitchen(restaurantId);
  }

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

export async function getActiveOrders(restaurantId: string, options?: { skipOverdueCheck?: boolean }) {
  if (!options?.skipOverdueCheck) {
    await checkOverdueItems(restaurantId);
  }

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

export async function getTodayOrdersByTable(restaurantId: string) {
  const tables = await prisma.table.findMany({
    where: { restaurantId, number: { lt: 900 } },
    orderBy: { number: "asc" },
    select: { id: true, number: true },
  });

  if (tables.length === 0) return [];

  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      date: todayDateString(),
      status: { not: "CANCELLED" },
      tableId: { in: tables.map((table) => table.id) },
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

  const ordersByTable = new Map<string, typeof orders>();
  for (const table of tables) ordersByTable.set(table.id, []);
  for (const order of orders) {
    if (!order.tableId) continue;
    const list = ordersByTable.get(order.tableId) ?? [];
    list.push(order);
    ordersByTable.set(order.tableId, list);
  }

  return tables.map((table) => ({
    id: table.id,
    number: table.number,
    orders: (ordersByTable.get(table.id) ?? []).map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      status: order.status,
      paidAt: order.paidAt,
      createdAt: order.createdAt,
      total: sumOrderRevenue(order.items),
      items: order.items,
    })),
  }));
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

export async function getCompletedOrders(restaurantId: string, limit = 50) {
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
    take: limit,
  });
}

export async function getMissedTimelineItems(restaurantId: string, options?: { skipOverdueCheck?: boolean }) {
  if (!options?.skipOverdueCheck) {
    await checkOverdueItems(restaurantId);
  }

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

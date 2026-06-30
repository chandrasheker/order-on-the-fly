import { prisma } from "@/lib/prisma";
import { countsTowardRevenue, orderItemLineTotal, sumPaidOrderRevenue, todayDateString } from "@/lib/utils";

export type StaffPerformanceRow = {
  userId: string;
  name: string;
  role: string;
  itemsPrepared: number;
  itemsMarkedReady: number;
  itemsServed: number;
  ordersServed: number;
  ordersPlaced: number;
  paymentsCollected: number;
  revenueCollected: number;
  tablesServed: number[];
};

function bumpStaff(
  map: Map<string, StaffPerformanceRow>,
  userId: string,
  name: string,
  role: string,
) {
  if (!map.has(userId)) {
    map.set(userId, {
      userId,
      name,
      role,
      itemsPrepared: 0,
      itemsMarkedReady: 0,
      itemsServed: 0,
      ordersServed: 0,
      ordersPlaced: 0,
      paymentsCollected: 0,
      revenueCollected: 0,
      tablesServed: [],
    });
  }
  return map.get(userId)!;
}

export async function getStaffPerformanceReport(restaurantId: string, date = todayDateString()) {
  const [orders, staffUsers] = await Promise.all([
    prisma.order.findMany({
      where: { restaurantId, date, status: { not: "CANCELLED" } },
      include: {
        table: { select: { number: true } },
        items: true,
        payments: {
          select: {
            amount: true,
            collectedByUserId: true,
            collectedByName: true,
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { restaurantId },
      select: { id: true, name: true, role: true, slotKey: true },
    }),
  ]);

  const byStaff = new Map<string, StaffPerformanceRow>();
  const servedOrdersByStaff = new Map<string, Set<string>>();
  const roleById = new Map(staffUsers.map((user) => [user.id, user.role]));

  for (const user of staffUsers) {
    bumpStaff(byStaff, user.id, user.name, user.role);
  }

  const roleFor = (userId: string) => roleById.get(userId) ?? "STAFF";

  for (const order of orders) {
    if (order.placedByUserId && order.placedByName) {
      const row = bumpStaff(
        byStaff,
        order.placedByUserId,
        order.placedByName,
        roleFor(order.placedByUserId),
      );
      row.ordersPlaced += 1;
    }

    if (order.payments.length > 0) {
      for (const payment of order.payments) {
        if (!payment.collectedByUserId || !payment.collectedByName) continue;
        const row = bumpStaff(
          byStaff,
          payment.collectedByUserId,
          payment.collectedByName,
          roleFor(payment.collectedByUserId),
        );
        row.paymentsCollected += 1;
        row.revenueCollected += payment.amount;
      }
    } else if (order.paidAt && order.paidByUserId && order.paidByName) {
      const row = bumpStaff(
        byStaff,
        order.paidByUserId,
        order.paidByName,
        roleFor(order.paidByUserId),
      );
      row.paymentsCollected += 1;
      row.revenueCollected += sumPaidOrderRevenue(order, order.items);
    }

    for (const item of order.items) {
      if (item.preparedByUserId && item.preparedByName) {
        bumpStaff(
          byStaff,
          item.preparedByUserId,
          item.preparedByName,
          roleFor(item.preparedByUserId),
        ).itemsPrepared += item.quantity;
      }
      if (item.readyByUserId && item.readyByName) {
        bumpStaff(
          byStaff,
          item.readyByUserId,
          item.readyByName,
          roleFor(item.readyByUserId),
        ).itemsMarkedReady += item.quantity;
      }
      if (item.servedByUserId && item.servedByName && item.status === "SERVED") {
        const row = bumpStaff(
          byStaff,
          item.servedByUserId,
          item.servedByName,
          roleFor(item.servedByUserId),
        );
        row.itemsServed += item.quantity;
        if (!servedOrdersByStaff.has(item.servedByUserId)) {
          servedOrdersByStaff.set(item.servedByUserId, new Set());
        }
        servedOrdersByStaff.get(item.servedByUserId)!.add(order.id);
        if (!row.tablesServed.includes(order.table.number)) {
          row.tablesServed.push(order.table.number);
        }
      }
    }
  }

  for (const [userId, orderIds] of servedOrdersByStaff) {
    const row = byStaff.get(userId);
    if (row) row.ordersServed = orderIds.size;
  }

  const staff = Array.from(byStaff.values())
    .map((row) => ({
      ...row,
      tablesServed: [...row.tablesServed].sort((a, b) => a - b),
      avgRevenuePerPayment:
        row.paymentsCollected > 0
          ? Math.round(row.revenueCollected / row.paymentsCollected)
          : 0,
    }))
    .filter(
      (row) =>
        row.itemsPrepared > 0 ||
        row.itemsMarkedReady > 0 ||
        row.itemsServed > 0 ||
        row.ordersPlaced > 0 ||
        row.paymentsCollected > 0,
    )
    .sort((a, b) => b.itemsServed - a.itemsServed || b.revenueCollected - a.revenueCollected);

  const totals = {
    itemsServed: staff.reduce((sum, row) => sum + row.itemsServed, 0),
    ordersServed: new Set(
      orders.flatMap((order) =>
        order.items
          .filter((item) => item.servedByUserId && item.status === "SERVED")
          .map(() => order.id),
      ),
    ).size,
    paymentsCollected: staff.reduce((sum, row) => sum + row.paymentsCollected, 0),
    revenueCollected: staff.reduce((sum, row) => sum + row.revenueCollected, 0),
  };

  return { date, staff, totals, roster: staffUsers };
}

export async function getTableServiceLog(restaurantId: string, date = todayDateString()) {
  const orders = await prisma.order.findMany({
    where: { restaurantId, date, status: { not: "CANCELLED" } },
    include: {
      table: { select: { number: true } },
      items: {
        select: {
          itemName: true,
          quantity: true,
          status: true,
          servedByName: true,
          servedAt: true,
          unitPrice: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return orders.map((order) => {
    const servers = [
      ...new Set(
        order.items
          .filter((item) => item.servedByName && item.status === "SERVED")
          .map((item) => item.servedByName as string),
      ),
    ];
    return {
      orderNumber: order.orderNumber,
      tableNumber: order.table.number,
      customerName: order.customerName,
      placedByName: order.placedByName,
      paidByName: order.paidByName,
      servers,
      status: order.status,
      paidAt: order.paidAt,
      total: order.items.reduce(
        (sum, item) =>
          sum +
          orderItemLineTotal({
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            status: item.status,
          }),
        0,
      ),
    };
  });
}

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { todayDateString, sumPaidOrderRevenue, orderItemLineTotal, countsTowardRevenue } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { getStaffPerformanceReport, getTableServiceLog } from "@/lib/staff-performance-service";

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = req.nextUrl.searchParams.get("date") || todayDateString();
  const format = req.nextUrl.searchParams.get("format") || "json";
  const isManager = session.role === "OWNER" || session.role === "MANAGER";

  if (format === "csv" && !isManager) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orders = await prisma.order.findMany({
    where: { restaurantId: session.restaurantId, date },
    include: {
      table: true,
      items: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const performance = isManager
    ? await getStaffPerformanceReport(session.restaurantId, date)
    : null;
  const tableLog = isManager
    ? await getTableServiceLog(session.restaurantId, date)
    : null;

  const summary = {
    date,
    restaurant: session.restaurantName,
    totalOrders: orders.length,
    totalRevenue: orders.reduce((sum, o) => sum + sumPaidOrderRevenue(o, o.items), 0),
    itemBreakdown: {} as Record<string, { quantity: number; revenue: number }>,
    tableBreakdown: {} as Record<number, { orders: number; revenue: number }>,
    staffPerformance: performance?.staff ?? [],
    staffTotals: performance?.totals ?? null,
    tableServiceLog: tableLog ?? [],
    orders: orders.map((o) => ({
      orderNumber: o.orderNumber,
      table: o.table.number,
      customer: o.customerName,
      status: o.status,
      time: o.createdAt,
      placedBy: o.placedByName,
      paidBy: o.paidByName,
      items: o.items.map((i) => ({
        name: i.itemName,
        qty: i.quantity,
        price: i.unitPrice,
        total: orderItemLineTotal(i),
        status: i.status,
        prepTime: i.prepTimeMinutes,
        served: i.servedAt,
        servedBy: i.servedByName,
        preparedBy: i.preparedByName,
        readyBy: i.readyByName,
        overdue: i.isOverdue,
      })),
      total: sumPaidOrderRevenue(o, o.items),
    })),
  };

  for (const order of orders) {
    const tableNum = order.table.number;
    if (!summary.tableBreakdown[tableNum]) {
      summary.tableBreakdown[tableNum] = { orders: 0, revenue: 0 };
    }
    summary.tableBreakdown[tableNum].orders++;
    if (!order.paidAt) continue;
    for (const item of order.items) {
      if (!countsTowardRevenue(item.status)) continue;
      const rev = item.unitPrice * item.quantity;
      summary.tableBreakdown[tableNum].revenue += rev;
      if (!summary.itemBreakdown[item.itemName]) {
        summary.itemBreakdown[item.itemName] = { quantity: 0, revenue: 0 };
      }
      summary.itemBreakdown[item.itemName].quantity += item.quantity;
      summary.itemBreakdown[item.itemName].revenue += rev;
    }
  }

  if (format === "csv") {
    const rows = [
      [
        "Order #",
        "Table",
        "Customer",
        "Item",
        "Qty",
        "Price",
        "Total",
        "Status",
        "Time",
        "Overdue",
        "Served By",
        "Paid By",
      ].join(","),
    ];
    for (const o of summary.orders) {
      for (const item of o.items) {
        rows.push(
          [
            o.orderNumber,
            o.table,
            o.customer || "",
            `"${item.name}"`,
            item.qty,
            item.price,
            item.total,
            o.status,
            new Date(o.time).toLocaleTimeString(),
            item.overdue ? "YES" : "NO",
            item.servedBy || "",
            o.paidBy || "",
          ].join(","),
        );
      }
    }
    return new NextResponse(rows.join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="report-${date}.csv"`,
      },
    });
  }

  return NextResponse.json(summary);
}

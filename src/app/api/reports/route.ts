import { NextRequest, NextResponse } from "next/server";
import { requireSession, canViewReports } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canViewReports(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = req.nextUrl.searchParams.get("date") ||
    new Date().toISOString().split("T")[0];
  const format = req.nextUrl.searchParams.get("format") || "json";

  const orders = await prisma.order.findMany({
    where: { restaurantId: session.restaurantId, date },
    include: {
      table: true,
      items: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const summary = {
    date,
    restaurant: session.restaurantName,
    totalOrders: orders.length,
    totalRevenue: orders.reduce(
      (sum, o) =>
        sum + o.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
      0
    ),
    itemBreakdown: {} as Record<string, { quantity: number; revenue: number }>,
    tableBreakdown: {} as Record<number, { orders: number; revenue: number }>,
    orders: orders.map((o) => ({
      orderNumber: o.orderNumber,
      table: o.table.number,
      customer: o.customerName,
      status: o.status,
      time: o.createdAt,
      items: o.items.map((i) => ({
        name: i.itemName,
        qty: i.quantity,
        price: i.unitPrice,
        total: i.unitPrice * i.quantity,
        prepTime: i.prepTimeMinutes,
        served: i.servedAt,
        overdue: i.isOverdue,
      })),
      total: o.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
    })),
  };

  for (const order of orders) {
    const tableNum = order.table.number;
    if (!summary.tableBreakdown[tableNum]) {
      summary.tableBreakdown[tableNum] = { orders: 0, revenue: 0 };
    }
    summary.tableBreakdown[tableNum].orders++;
    for (const item of order.items) {
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
      ["Order #", "Table", "Customer", "Item", "Qty", "Price", "Total", "Status", "Time", "Overdue"].join(","),
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
          ].join(",")
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

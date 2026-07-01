"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button, Card, Spinner } from "@/components/ui";
import { ArrowLeft, Download, Calendar } from "lucide-react";
import Link from "next/link";
import { formatCurrency, todayDateString } from "@/lib/utils";

interface ReportData {
  date: string;
  restaurant: string;
  totalOrders: number;
  totalRevenue: number;
  itemBreakdown: Record<string, { quantity: number; revenue: number }>;
  tableBreakdown: Record<number, { orders: number; revenue: number }>;
  staffPerformance?: Array<{
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
    avgRevenuePerPayment: number;
  }>;
  tableServiceLog?: Array<{
    orderNumber: number;
    tableNumber: number;
    customerName: string | null;
    placedByName: string | null;
    paidByName: string | null;
    servers: string[];
    status: string;
    paidAt: string | null;
    total: number;
  }>;
  orders: {
    orderNumber: number;
    table: number;
    customer: string | null;
    status: string;
    time: string;
    total: number;
    items: { name: string; qty: number; price: number; total: number; overdue: boolean }[];
  }[];
}

export default function ReportsPage() {
  const router = useRouter();
  const [date, setDate] = useState(todayDateString());
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [canDownload, setCanDownload] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        const role = data.user?.role;
        setCanDownload(role === "OWNER" || role === "MANAGER");
      })
      .catch(() => undefined);
  }, []);

  const fetchReport = (d: string) => {
    setLoading(true);
    fetch(`/api/reports?date=${d}`)
      .then((r) => {
        if (!r.ok) {
          router.push("/");
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data) setReport(data);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchReport(date); }, [date]);

  const downloadCSV = () => {
    window.open(`/api/reports?date=${date}&format=csv`, "_blank");
  };

  if (loading && !report) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-shell">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  const topItems = report
    ? Object.entries(report.itemBreakdown)
        .sort(([, a], [, b]) => b.quantity - a.quantity)
        .slice(0, 10)
    : [];

  return (
    <div className="min-h-screen bg-app-shell text-foreground">
      <header className="border-b border-white/5 px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/staff/dashboard" className="p-2 rounded-xl bg-white/5 hover:bg-white/10">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-xl font-bold">Daily Reports</h1>
              <p className="text-sm text-zinc-400">{report?.restaurant}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 border border-white/10">
              <Calendar className="w-4 h-4 text-zinc-400" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-transparent text-sm text-foreground outline-none"
              />
            </div>
            {canDownload && (
              <Button onClick={downloadCSV} variant="secondary">
                <Download className="w-4 h-4" /> CSV
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {report && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Card className="p-5">
                <p className="text-sm text-zinc-400">Total Orders</p>
                <p className="text-3xl font-bold">{report.totalOrders}</p>
              </Card>
              <Card className="p-5">
                <p className="text-sm text-zinc-400">Revenue</p>
                <p className="text-3xl font-bold text-emerald-400">{formatCurrency(report.totalRevenue)}</p>
              </Card>
              <Card className="p-5 col-span-2 md:col-span-1">
                <p className="text-sm text-zinc-400">Unique Items Sold</p>
                <p className="text-3xl font-bold">{Object.keys(report.itemBreakdown).length}</p>
              </Card>
            </div>

            <Card className="p-5">
              <h2 className="font-bold mb-4">Top Items</h2>
              <div className="space-y-2">
                {topItems.map(([name, data], i) => (
                  <div key={name} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-zinc-500 w-6">#{i + 1}</span>
                      <span>{name}</span>
                    </div>
                    <div className="text-sm text-zinc-400">
                      {data.quantity} sold · {formatCurrency(data.revenue)}
                    </div>
                  </div>
                ))}
                {topItems.length === 0 && (
                  <p className="text-zinc-500 text-center py-4">No orders for this date</p>
                )}
              </div>
            </Card>

            {canDownload && report.staffPerformance && report.staffPerformance.length > 0 && (
              <Card className="p-5">
                <h2 className="font-bold mb-1">Team performance</h2>
                <p className="text-sm text-zinc-400 mb-4">
                  Tracked from serve, prepare, phone-order, and mark-paid actions
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-zinc-500 border-b border-white/10">
                        <th className="py-2 pr-4">Staff</th>
                        <th className="py-2 pr-4">Role</th>
                        <th className="py-2 pr-4">Items served</th>
                        <th className="py-2 pr-4">Orders served</th>
                        <th className="py-2 pr-4">Phone orders</th>
                        <th className="py-2 pr-4">Payments</th>
                        <th className="py-2 pr-4">Revenue</th>
                        <th className="py-2">Tables</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.staffPerformance.map((row) => (
                        <tr key={row.userId} className="border-b border-white/5 last:border-0">
                          <td className="py-3 pr-4 font-medium text-foreground">{row.name}</td>
                          <td className="py-3 pr-4 capitalize text-zinc-400">{row.role.toLowerCase()}</td>
                          <td className="py-3 pr-4">{row.itemsServed}</td>
                          <td className="py-3 pr-4">{row.ordersServed}</td>
                          <td className="py-3 pr-4">{row.ordersPlaced}</td>
                          <td className="py-3 pr-4">{row.paymentsCollected}</td>
                          <td className="py-3 pr-4 text-emerald-400">{formatCurrency(row.revenueCollected)}</td>
                          <td className="py-3 text-zinc-400">
                            {row.tablesServed.length > 0
                              ? row.tablesServed.map((t) => `T${t}`).join(", ")
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {canDownload && report.tableServiceLog && report.tableServiceLog.length > 0 && (
              <Card className="p-5">
                <h2 className="font-bold mb-4">Table service log</h2>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {report.tableServiceLog.map((entry) => (
                    <div
                      key={`${entry.orderNumber}-${entry.tableNumber}`}
                      className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-white/5 last:border-0 text-sm"
                    >
                      <div>
                        <span className="font-medium text-foreground">
                          #{entry.orderNumber} · Table {entry.tableNumber}
                        </span>
                        {entry.customerName && (
                          <span className="text-zinc-500"> · {entry.customerName}</span>
                        )}
                      </div>
                      <div className="text-zinc-400 text-right">
                        {entry.servers.length > 0 ? (
                          <span>Served by {entry.servers.join(", ")}</span>
                        ) : (
                          <span className="text-zinc-600">Not served yet</span>
                        )}
                        {entry.paidByName && (
                          <span className="block text-emerald-400/80">Paid by {entry.paidByName}</span>
                        )}
                        {entry.placedByName && (
                          <span className="block text-violet-400/80">Placed by {entry.placedByName}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card className="p-5">
              <h2 className="font-bold mb-4">Order Details</h2>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {report.orders.length === 0 && (
                  <p className="text-zinc-500 text-center py-4">No orders for this date</p>
                )}
                {report.orders.map((o) => (
                  <div key={o.orderNumber} className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex justify-between mb-1">
                      <span className="font-medium">#{o.orderNumber} · Table {o.table}</span>
                      <span className="text-emerald-400">{formatCurrency(o.total)}</span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      {new Date(o.time).toLocaleTimeString()}
                      {o.customer && ` · ${o.customer}`}
                    </p>
                    <div className="mt-2 text-sm text-zinc-400">
                      {o.items.map((i) => `${i.qty}x ${i.name}`).join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

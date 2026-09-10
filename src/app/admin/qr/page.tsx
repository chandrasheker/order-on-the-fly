"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button, Card, Spinner, Input } from "@/components/ui";
import { Download, Plus, Printer, QrCode } from "lucide-react";
import { isDineInTable } from "@/lib/order-channel";

interface QRData {
  id: string;
  number: number;
  url: string;
  dataUrl: string;
  isActive: boolean;
}

interface TableSetting {
  id: string;
  number: number;
  kind?: string;
  maxSessions: number;
  activeSessions: number;
  isActive: boolean;
  orderingEnabled: boolean;
}

export default function QRPage() {
  const router = useRouter();
  const [qrCodes, setQrCodes] = useState<QRData[]>([]);
  const [restaurantName, setRestaurantName] = useState("");
  const [tables, setTables] = useState<TableSetting[]>([]);
  const [defaultMaxSessions, setDefaultMaxSessions] = useState(2);
  const [loading, setLoading] = useState(true);
  const [savingDefault, setSavingDefault] = useState(false);
  const [addingTable, setAddingTable] = useState(false);
  const [busyTableId, setBusyTableId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadAll = () => {
    Promise.all([
      fetch("/api/tables/qr").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/tables/manage").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([qrData, manageData]) => {
        if (!qrData) {
          router.push("/");
          return;
        }
        setQrCodes(qrData.qrCodes);
        setRestaurantName(qrData.restaurantName);
        if (manageData) {
          setTables(
            (manageData.tables ?? []).filter((table: TableSetting) => isDineInTable(table)),
          );
          setDefaultMaxSessions(manageData.defaultMaxSessions);
        }
      })
      .catch((err) => console.error("Failed to load:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAll();
  }, [router]);

  const flashError = (text: string) => {
    setError(text);
    window.setTimeout(() => setError(""), 4000);
  };

  const saveDefault = async () => {
    setSavingDefault(true);
    await fetch("/api/tables/manage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultMaxSessions }),
    });
    setSavingDefault(false);
    loadAll();
  };

  const saveTableOrdering = async (tableId: string, orderingEnabled: boolean) => {
    setBusyTableId(tableId);
    await fetch("/api/tables/manage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tableId, orderingEnabled }),
    });
    setBusyTableId(null);
    loadAll();
  };

  const saveTableSessions = async (tableId: string, maxSessions: number) => {
    setBusyTableId(tableId);
    await fetch("/api/tables/manage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tableId, maxSessions }),
    });
    setBusyTableId(null);
    loadAll();
  };

  const addTable = async () => {
    if (addingTable) return;
    setAddingTable(true);
    const res = await fetch("/api/tables/qr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: 1 }),
    });
    const json = await res.json().catch(() => ({}));
    setAddingTable(false);
    if (!res.ok) {
      flashError(json.error || "Could not add table");
      return;
    }
    loadAll();
  };

  const printAll = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>TableTap QR Codes - ${restaurantName}</title>
      <style>
        body { font-family: system-ui; margin: 0; padding: 20px; }
        .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 30px; }
        .card { border: 2px solid #333; border-radius: 16px; padding: 24px; text-align: center; page-break-inside: avoid; }
        .table-num { font-size: 48px; font-weight: bold; margin: 12px 0; }
        .name { font-size: 14px; color: #666; margin-bottom: 8px; }
        img { width: 200px; height: 200px; }
        .scan { font-size: 12px; color: #888; margin-top: 8px; }
        @media print { .grid { grid-template-columns: repeat(2, 1fr); } }
      </style></head><body>
      <h1 style="text-align:center">${restaurantName} — Table QR Codes</h1>
      <div class="grid">
        ${qrCodes.map((q) => `
          <div class="card">
            <div class="name">${restaurantName}</div>
            <img src="${q.dataUrl}" alt="Table ${q.number}" />
            <div class="table-num">TABLE ${q.number}</div>
            <div class="scan">Scan to order · Powered by TableTap</div>
          </div>
        `).join("")}
      </div>
      <script>window.onload = () => window.print()</script>
      </body></html>
    `);
    win.document.close();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-xl px-4 py-3 text-sm bg-red-500/10 text-red-300 border border-red-500/30">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={() => void addTable()} disabled={addingTable}>
          <Plus className="w-4 h-4" />
          {addingTable ? "Adding…" : "Add table"}
        </Button>
        <p className="text-sm text-muted">
          {restaurantName} · {qrCodes.length} table{qrCodes.length === 1 ? "" : "s"}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
            <span className="text-xs text-muted whitespace-nowrap">Default phones</span>
            <Input
              type="number"
              min={1}
              max={20}
              value={defaultMaxSessions}
              onChange={(e) => setDefaultMaxSessions(parseInt(e.target.value, 10) || 2)}
              className="w-14 h-8 text-center text-sm"
              title="Used when a new table is added"
            />
            <Button size="sm" onClick={() => void saveDefault()} disabled={savingDefault}>
              {savingDefault ? "…" : "Save"}
            </Button>
          </div>
          <Button onClick={printAll}>
            <Printer className="w-4 h-4" /> Print All
          </Button>
        </div>
      </div>

      {qrCodes.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          No dine-in tables yet. Add a table to create its QR code.
        </Card>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          {qrCodes.map((qr, i) => {
            const setting = tables.find((table) => table.id === qr.id);
            const open = setting?.orderingEnabled ?? false;
            return (
              <motion.div
                key={qr.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Card className={`p-4 text-center ${open ? "" : "opacity-70"}`} glow>
                  <QrCode className="w-4 h-4 text-orange-400 mx-auto mb-2" />
                  <img
                    src={qr.dataUrl}
                    alt={`Table ${qr.number}`}
                    className="w-36 h-36 mx-auto rounded-xl"
                  />
                  <a
                    href={qr.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block text-[10px] leading-snug text-muted break-all px-1 hover:text-orange-700 dark:hover:text-orange-300"
                    title={qr.url}
                  >
                    {qr.url}
                  </a>
                  <p className="text-2xl font-bold mt-2">Table {qr.number}</p>
                  {setting ? (
                    <p className="text-[11px] text-muted">
                      {setting.activeSessions} seated · {open ? "Open" : "Closed"}
                    </p>
                  ) : null}
                  {setting ? (
                    <div className="mt-2 flex items-center justify-center gap-1.5">
                      <label className="text-[11px] text-muted">Phones</label>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={setting.maxSessions}
                        title="Max phones at this table"
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 2;
                          setTables((prev) =>
                            prev.map((row) =>
                              row.id === setting.id ? { ...row, maxSessions: val } : row,
                            ),
                          );
                        }}
                        className="w-14 h-8 text-center text-sm"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyTableId === setting.id}
                        onClick={() => void saveTableSessions(setting.id, setting.maxSessions)}
                      >
                        Save
                      </Button>
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    {setting ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={open ? "secondary" : "success"}
                        disabled={busyTableId === setting.id}
                        onClick={() => void saveTableOrdering(setting.id, !open)}
                        title="Same open/closed switch as dashboard table ordering"
                      >
                        {busyTableId === setting.id ? "…" : open ? "Disable" : "Enable"}
                      </Button>
                    ) : null}
                    <a
                      href={qr.dataUrl}
                      download={`table-${qr.number}-qr.png`}
                      className="inline-flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300"
                    >
                      <Download className="w-3 h-3" /> Download
                    </a>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}

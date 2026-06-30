"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button, Card, Spinner, Input } from "@/components/ui";
import { ArrowLeft, Download, Printer, QrCode, Users, CircleDollarSign } from "lucide-react";
import Link from "next/link";

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
  const [paymentQrUrl, setPaymentQrUrl] = useState("");
  const [uploadingPaymentQr, setUploadingPaymentQr] = useState(false);
  const [removingPaymentQr, setRemovingPaymentQr] = useState(false);
  const [paymentQrMessage, setPaymentQrMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [receiptLogoUrl, setReceiptLogoUrl] = useState("");
  const [receiptAddress, setReceiptAddress] = useState("");
  const [receiptPhone, setReceiptPhone] = useState("");
  const [receiptGstin, setReceiptGstin] = useState("");
  const [receiptGstEnabled, setReceiptGstEnabled] = useState(false);
  const [receiptGstRate, setReceiptGstRate] = useState(5);
  const [receiptFooter, setReceiptFooter] = useState("");
  const [savingReceipt, setSavingReceipt] = useState(false);
  const [receiptMessage, setReceiptMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const loadAll = () => {
    Promise.all([
      fetch("/api/tables/qr").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/tables/manage").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/payment/settings").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/receipt/settings").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([qrData, manageData, paymentData, receiptData]) => {
        if (!qrData) {
          router.push("/");
          return;
        }
        setQrCodes(qrData.qrCodes);
        setRestaurantName(qrData.restaurantName);
        if (manageData) {
          setTables(manageData.tables);
          setDefaultMaxSessions(manageData.defaultMaxSessions);
        }
        if (paymentData?.settings) {
          setPaymentQrUrl(paymentData.settings.paymentQrUrl ?? "");
        }
        if (receiptData?.settings) {
          setReceiptLogoUrl(receiptData.settings.logoUrl ?? "");
          setReceiptAddress(receiptData.settings.address ?? "");
          setReceiptPhone(receiptData.settings.phone ?? "");
          setReceiptGstin(receiptData.settings.gstin ?? "");
          setReceiptGstEnabled(Boolean(receiptData.settings.gstEnabled));
          setReceiptGstRate(Number(receiptData.settings.gstRate) || 5);
          setReceiptFooter(receiptData.settings.footer ?? "");
        }
      })
      .catch((err) => console.error("Failed to load:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAll();
  }, [router]);

  const saveReceiptSettings = async () => {
    setSavingReceipt(true);
    setReceiptMessage(null);
    try {
      const res = await fetch("/api/receipt/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logoUrl: receiptLogoUrl,
          address: receiptAddress,
          phone: receiptPhone,
          gstin: receiptGstin,
          gstEnabled: receiptGstEnabled,
          gstRate: receiptGstRate,
          footer: receiptFooter,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Could not save receipt settings");
      }
      setReceiptMessage({ type: "ok", text: "Receipt settings saved." });
    } catch (error) {
      setReceiptMessage({
        type: "err",
        text: error instanceof Error ? error.message : "Could not save receipt settings",
      });
    } finally {
      setSavingReceipt(false);
    }
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
    await fetch("/api/tables/manage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tableId, orderingEnabled }),
    });
    loadAll();
  };

  const saveTableSessions = async (tableId: string, maxSessions: number) => {
    await fetch("/api/tables/manage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tableId, maxSessions }),
    });
    loadAll();
  };

  const uploadPaymentQr = async (file: File) => {
    setUploadingPaymentQr(true);
    setPaymentQrMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/payment/settings/upload", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        setPaymentQrMessage({ type: "err", text: json.error || "Upload failed." });
        return;
      }
      setPaymentQrUrl(json.settings.paymentQrUrl ?? "");
      setPaymentQrMessage({ type: "ok", text: json.message || "PhonePe QR uploaded." });
    } catch {
      setPaymentQrMessage({ type: "err", text: "Upload failed. Please try again." });
    } finally {
      setUploadingPaymentQr(false);
    }
  };

  const removePaymentQr = async () => {
    setRemovingPaymentQr(true);
    setPaymentQrMessage(null);
    try {
      const res = await fetch("/api/payment/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentQrUrl: null }),
      });
      const json = await res.json();
      if (!res.ok) {
        setPaymentQrMessage({ type: "err", text: json.error || "Could not remove QR." });
        return;
      }
      setPaymentQrUrl("");
      setPaymentQrMessage({ type: "ok", text: "PhonePe QR removed." });
    } catch {
      setPaymentQrMessage({ type: "err", text: "Could not remove QR. Please try again." });
    } finally {
      setRemovingPaymentQr(false);
    }
  };

  const handlePaymentQrFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void uploadPaymentQr(file);
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
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a12]">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a12] text-white">
      <header className="border-b border-white/5 px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/staff/dashboard" className="p-2 rounded-xl bg-white/5 hover:bg-white/10">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-xl font-bold">Table QR Codes</h1>
              <p className="text-sm text-zinc-400">{restaurantName} · {qrCodes.length} tables</p>
            </div>
          </div>
          <Button onClick={printAll}>
            <Printer className="w-4 h-4" /> Print All
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Printer className="w-5 h-5 text-violet-400" />
            <h2 className="text-lg font-bold">Thermal bill / receipt</h2>
          </div>
          <p className="text-sm text-zinc-400 mb-4">
            These details print on ESC/POS Bluetooth receipts when staff marks a bill paid.
            Add your logo URL, address, and optional GST.
          </p>

          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Logo URL</label>
              <Input
                value={receiptLogoUrl}
                onChange={(e) => setReceiptLogoUrl(e.target.value)}
                placeholder="https://your-restaurant.com/logo.png"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Phone</label>
              <Input
                value={receiptPhone}
                onChange={(e) => setReceiptPhone(e.target.value)}
                placeholder="+91 98765 43210"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-zinc-500 block mb-1">Address</label>
              <Input
                value={receiptAddress}
                onChange={(e) => setReceiptAddress(e.target.value)}
                placeholder="Street, city, state, PIN"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">GSTIN (optional)</label>
              <Input
                value={receiptGstin}
                onChange={(e) => setReceiptGstin(e.target.value)}
                placeholder="22AAAAA0000A1Z5"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Footer message</label>
              <Input
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
                placeholder="Thank you! Visit again."
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 mb-4 p-4 rounded-xl bg-white/5 border border-white/10">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={receiptGstEnabled}
                onChange={(e) => setReceiptGstEnabled(e.target.checked)}
                className="rounded border-white/20"
              />
              Add GST on printed bills
            </label>
            {receiptGstEnabled && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-zinc-500">GST rate %</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={receiptGstRate}
                  onChange={(e) => setReceiptGstRate(parseFloat(e.target.value) || 0)}
                  className="w-24"
                />
              </div>
            )}
          </div>

          {receiptLogoUrl.trim() && (
            <div className="mb-4 inline-block p-3 rounded-xl bg-white">
              <img
                src={receiptLogoUrl}
                alt="Receipt logo preview"
                className="max-h-24 max-w-[220px] object-contain"
              />
            </div>
          )}

          <Button size="sm" onClick={() => void saveReceiptSettings()} disabled={savingReceipt}>
            {savingReceipt ? "Saving..." : "Save receipt settings"}
          </Button>
          {receiptMessage && (
            <p
              className={`text-sm mt-3 ${receiptMessage.type === "ok" ? "text-emerald-400" : "text-red-400"}`}
            >
              {receiptMessage.text}
            </p>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <CircleDollarSign className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold">PhonePe payment QR</h2>
          </div>
          <p className="text-sm text-zinc-400 mb-4">
            Choose your PhonePe static QR image from this computer. Customers will scan it when
            they tap Pay. Leave empty to use offline collection — staff gets alerted and must mark
            paid manually.
          </p>

          {paymentQrMessage && (
            <p
              className={`text-sm mb-4 ${
                paymentQrMessage.type === "ok" ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {paymentQrMessage.text}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 mb-4">
            <label className="inline-flex">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                disabled={uploadingPaymentQr || removingPaymentQr}
                onChange={handlePaymentQrFileChange}
              />
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-sm font-medium cursor-pointer disabled:opacity-50">
                {uploadingPaymentQr ? "Uploading..." : "Choose QR image"}
              </span>
            </label>
            {paymentQrUrl.trim() && (
              <Button
                variant="secondary"
                onClick={removePaymentQr}
                disabled={uploadingPaymentQr || removingPaymentQr}
              >
                {removingPaymentQr ? "Removing..." : "Remove QR"}
              </Button>
            )}
          </div>

          {paymentQrUrl.trim() ? (
            <div className="inline-block p-3 rounded-xl bg-white">
              <img
                src={paymentQrUrl}
                alt="Payment QR preview"
                className="w-40 h-40 object-contain"
              />
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No payment QR uploaded yet.</p>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-5 h-5 text-orange-400" />
            <h2 className="text-lg font-bold">Table ordering sessions</h2>
          </div>
          <p className="text-sm text-zinc-400 mb-4">
            Limit how many phones can order at each table at the same time. Default is 2 — increase
            for large tables (e.g. Table 8 with 10 seats → set 4–6 sessions).
          </p>
          <div className="flex flex-wrap items-end gap-3 mb-6 pb-6 border-b border-white/10">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Default for new tables</label>
              <Input
                type="number"
                min={1}
                max={20}
                value={defaultMaxSessions}
                onChange={(e) => setDefaultMaxSessions(parseInt(e.target.value, 10) || 2)}
                className="w-24"
              />
            </div>
            <Button size="sm" onClick={saveDefault} disabled={savingDefault}>
              {savingDefault ? "Saving..." : "Save default"}
            </Button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {tables.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/5 border border-white/10"
              >
                <div>
                  <p className="font-medium">Table {t.number}</p>
                  <p className="text-xs text-zinc-500">
                    {t.activeSessions} active now · max {t.maxSessions}
                    {t.orderingEnabled ? " · ordering open" : " · ordering closed"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Button
                    size="sm"
                    variant={t.orderingEnabled ? "secondary" : "primary"}
                    onClick={() => saveTableOrdering(t.id, !t.orderingEnabled)}
                  >
                    {t.orderingEnabled ? "Close ordering" : "Open ordering"}
                  </Button>
                  <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={t.maxSessions}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 2;
                      setTables((prev) =>
                        prev.map((row) =>
                          row.id === t.id ? { ...row, maxSessions: val } : row
                        )
                      );
                    }}
                    className="w-16 text-center"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => saveTableSessions(t.id, t.maxSessions)}
                  >
                    Save
                  </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"
        >
          {qrCodes.map((qr, i) => (
            <motion.div
              key={qr.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="p-6 text-center" glow>
                <QrCode className="w-5 h-5 text-orange-400 mx-auto mb-2" />
                <img src={qr.dataUrl} alt={`Table ${qr.number}`} className="w-40 h-40 mx-auto rounded-xl" />
                <p className="text-3xl font-bold mt-3">Table {qr.number}</p>
                <p className="text-xs text-zinc-500 mt-2 truncate">{qr.url}</p>
                <a
                  href={qr.dataUrl}
                  download={`table-${qr.number}-qr.png`}
                  className="inline-flex items-center gap-1 text-xs text-orange-400 mt-3 hover:text-orange-300"
                >
                  <Download className="w-3 h-3" /> Download
                </a>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </main>
    </div>
  );
}

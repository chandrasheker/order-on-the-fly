"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button, Card, Spinner } from "@/components/ui";
import { ArrowLeft, Download, Printer, QrCode } from "lucide-react";
import Link from "next/link";

interface QRData {
  id: string;
  number: number;
  url: string;
  dataUrl: string;
  isActive: boolean;
}

export default function QRPage() {
  const router = useRouter();
  const [qrCodes, setQrCodes] = useState<QRData[]>([]);
  const [restaurantName, setRestaurantName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tables/qr")
      .then(async (r) => {
        if (!r.ok) {
          router.push("/");
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data) {
          setQrCodes(data.qrCodes);
          setRestaurantName(data.restaurantName);
        }
      })
      .catch((err) => console.error("Failed to load QR codes:", err))
      .finally(() => setLoading(false));
  }, [router]);

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

      <main className="max-w-5xl mx-auto px-4 py-8">
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

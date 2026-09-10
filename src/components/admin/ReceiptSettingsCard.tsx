"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";

export function ReceiptSettingsCard() {
  const [receiptLogoUrl, setReceiptLogoUrl] = useState("");
  const [receiptAddress, setReceiptAddress] = useState("");
  const [receiptPhone, setReceiptPhone] = useState("");
  const [receiptGstin, setReceiptGstin] = useState("");
  const [receiptGstEnabled, setReceiptGstEnabled] = useState(false);
  const [receiptGstRate, setReceiptGstRate] = useState(5);
  const [receiptFooter, setReceiptFooter] = useState("");
  const [savingReceipt, setSavingReceipt] = useState(false);
  const [receiptMessage, setReceiptMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    void fetch("/api/receipt/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((receiptData) => {
        if (!receiptData?.settings) return;
        setReceiptLogoUrl(receiptData.settings.logoUrl ?? "");
        setReceiptAddress(receiptData.settings.address ?? "");
        setReceiptPhone(receiptData.settings.phone ?? "");
        setReceiptGstin(receiptData.settings.gstin ?? "");
        setReceiptGstEnabled(Boolean(receiptData.settings.gstEnabled));
        setReceiptGstRate(Number(receiptData.settings.gstRate) || 5);
        setReceiptFooter(receiptData.settings.footer ?? "");
      });
  }, []);

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

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <Printer className="w-5 h-5 text-violet-400" />
        <h2 className="text-lg font-bold">Thermal bill / receipt</h2>
      </div>
      <p className="text-sm text-zinc-400 mb-4">
        These details print on ESC/POS Bluetooth receipts when staff marks a bill paid.
        The restaurant logo from Operations → Branding is used unless you override it with a URL here.
      </p>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Logo URL (optional override)</label>
          <Input
            value={receiptLogoUrl}
            onChange={(e) => setReceiptLogoUrl(e.target.value)}
            placeholder="Uses uploaded restaurant logo if empty"
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
  );
}

"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { CircleDollarSign } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import { readApiErrorMessage } from "@/lib/admin-api-error";

export function ManualUpiCard() {
  const [paymentQrUrl, setPaymentQrUrl] = useState("");
  const [upiVpa, setUpiVpa] = useState("");
  const [upiMerchantName, setUpiMerchantName] = useState("");
  const [savingUpi, setSavingUpi] = useState(false);
  const [uploadingPaymentQr, setUploadingPaymentQr] = useState(false);
  const [removingPaymentQr, setRemovingPaymentQr] = useState(false);
  const [paymentQrMessage, setPaymentQrMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    void fetch("/api/payment/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((paymentData) => {
        if (!paymentData?.settings) return;
        setPaymentQrUrl(paymentData.settings.paymentQrUrl ?? "");
        setUpiVpa(paymentData.settings.upiVpa ?? "");
        setUpiMerchantName(paymentData.settings.upiMerchantName ?? "");
      });
  }, []);

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
      const json = res.ok ? await res.json() : null;
      if (!res.ok) {
        setPaymentQrMessage({
          type: "err",
          text: await readApiErrorMessage(res, "Upload failed."),
        });
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

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <CircleDollarSign className="w-5 h-5 text-emerald-400" />
        <h2 className="text-lg font-bold">Manual UPI</h2>
      </div>
      <p className="text-sm text-zinc-400 mb-4">
        Staff verifies payment. Add your UPI ID and optional static QR. Automatic Razorpay
        checkout is configured in the card above.
      </p>
      <div className="space-y-3 mb-4">
        <div>
          <label className="text-xs text-zinc-500 block mb-1">UPI ID</label>
          <Input
            placeholder="abcrestaurant@upi"
            value={upiVpa}
            onChange={(e) => setUpiVpa(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Merchant name</label>
          <Input
            placeholder="Restaurant display name"
            value={upiMerchantName}
            onChange={(e) => setUpiMerchantName(e.target.value)}
          />
        </div>
        <Button
          size="sm"
          disabled={savingUpi}
          onClick={() => {
            setSavingUpi(true);
            void fetch("/api/payment/settings", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ upiVpa, upiMerchantName }),
            })
              .then(async (res) => {
                const json = await res.json().catch(() => ({}));
                if (!res.ok) {
                  setPaymentQrMessage({ type: "err", text: json.error || "Could not save UPI" });
                  return;
                }
                setUpiVpa(json.settings?.upiVpa ?? upiVpa);
                setUpiMerchantName(json.settings?.upiMerchantName ?? upiMerchantName);
                setPaymentQrMessage({ type: "ok", text: "UPI settings saved." });
              })
              .finally(() => setSavingUpi(false));
          }}
        >
          {savingUpi ? "Saving..." : "Save UPI ID"}
        </Button>
      </div>

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
            onClick={() => void removePaymentQr()}
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
  );
}

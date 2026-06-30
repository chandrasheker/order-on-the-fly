"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";
import { Button, Input } from "@/components/ui";

type SwitchRequest = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  sourceTableNumber: number;
  targetTableNumber: number;
  note?: string | null;
  targetTableToken: string;
  restaurantSlug: string;
};

export function TableSwitchRequest({
  slug,
  tableToken,
  sessionKey,
  customerName,
  enabled,
}: {
  slug: string;
  tableToken: string;
  sessionKey: string;
  customerName: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [targetTableNumber, setTargetTableNumber] = useState("");
  const [note, setNote] = useState("");
  const [request, setRequest] = useState<SwitchRequest | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchStatus = async () => {
    if (!sessionKey) return;
    const res = await fetch(
      `/api/table-switch?tableToken=${encodeURIComponent(tableToken)}&sessionKey=${encodeURIComponent(sessionKey)}`,
      { credentials: "include" },
    );
    if (!res.ok) return;
    const json = await res.json();
    setRequest(json.request ?? null);
  };

  useEffect(() => {
    if (!enabled || !sessionKey) return;
    void fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [enabled, sessionKey, tableToken]);

  useEffect(() => {
    if (request?.status !== "APPROVED") return;
    router.replace(`/order/${slug}/${request.targetTableToken}/check-in`);
  }, [request, router, slug]);

  const submit = async () => {
    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch("/api/table-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tableToken,
          sessionKey,
          targetTableNumber,
          note,
          customerName,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error || "Could not request table switch");
        return;
      }
      setRequest(json.request);
      setMessage("Request sent. Staff will approve the table switch.");
      setTargetTableNumber("");
      setNote("");
    } finally {
      setSubmitting(false);
    }
  };

  if (!enabled || !sessionKey) return null;

  if (request?.status === "PENDING") {
    return (
      <div className="p-4 rounded-2xl bg-sky-500/15 border border-sky-500/30 text-sky-100 space-y-2">
        <p className="font-semibold flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4" />
          Table switch requested
        </p>
        <p className="text-sm text-sky-200/80">
          Waiting for staff approval to move to Table {request.targetTableNumber}.
        </p>
      </div>
    );
  }

  if (request?.status === "REJECTED") {
    return (
      <div className="p-4 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-100 space-y-2">
        <p className="font-semibold">Table switch was not approved</p>
        <p className="text-sm text-red-200/80">Please ask staff if you still need to move tables.</p>
        <button
          type="button"
          onClick={() => setRequest(null)}
          className="text-sm font-medium text-red-200 underline underline-offset-2 hover:text-red-100"
        >
          Request another table
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
      <div>
        <p className="font-semibold text-white flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-sky-300" />
          Need to switch tables?
        </p>
        <p className="text-xs text-zinc-400 mt-1">
          Request a move and staff will approve before your order is shifted.
        </p>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Input
          type="number"
          min={1}
          placeholder="New table number"
          value={targetTableNumber}
          onChange={(event) => setTargetTableNumber(event.target.value)}
        />
        <Button onClick={submit} disabled={submitting || !targetTableNumber.trim()}>
          {submitting ? "Sending..." : "Request"}
        </Button>
      </div>
      <Input
        placeholder="Optional note (e.g. moved near window)"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      {message && <p className="text-sm text-zinc-300">{message}</p>}
    </div>
  );
}

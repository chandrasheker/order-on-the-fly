"use client";

import { useEffect, useState, useCallback } from "react";
import { Bell, Check, CheckCheck } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";

interface GuestRequest {
  id: string;
  type: string;
  message: string | null;
  status: string;
  createdAt: string;
  table: { number: number };
}

const TYPE_LABELS: Record<string, string> = {
  CALL_WAITER: "Call waiter",
  REQUEST_BILL: "Request bill",
  WATER: "Water",
  REFILL: "Refill",
  OTHER: "Guest request",
};

export function GuestRequestsPanel({ enabled }: { enabled: boolean }) {
  const [requests, setRequests] = useState<GuestRequest[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRequests = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch("/api/realtime/guest-requests");
      if (res.ok) {
        const json = await res.json();
        setRequests(json.requests ?? []);
      }
    } catch {
      /* ignore */
    }
  }, [enabled]);

  useEffect(() => {
    void fetchRequests();
    if (!enabled) return;
    const interval = setInterval(fetchRequests, 5000);
    return () => clearInterval(interval);
  }, [enabled, fetchRequests]);

  const updateStatus = async (id: string, status: "ACKNOWLEDGED" | "RESOLVED") => {
    setLoading(true);
    try {
      await fetch("/api/realtime/guest-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      await fetchRequests();
    } finally {
      setLoading(false);
    }
  };

  if (!enabled || requests.length === 0) return null;

  return (
    <div className="mb-6 p-4 rounded-2xl border border-orange-500/30 bg-orange-500/10">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="w-5 h-5 text-orange-300" />
        <p className="font-semibold text-orange-200">Guest requests</p>
        <Badge className="bg-orange-500/20 text-orange-200">{requests.length}</Badge>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {requests.map((req) => (
          <div
            key={req.id}
            className={cn(
              "p-3 rounded-xl border bg-black/20",
              req.status === "PENDING" ? "border-orange-500/40" : "border-white/10",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-white">
                  Table {req.table.number} — {TYPE_LABELS[req.type] ?? req.type}
                </p>
                {req.message && <p className="text-sm text-zinc-400 mt-0.5">{req.message}</p>}
                <p className="text-xs text-zinc-500 mt-1">
                  {new Date(req.createdAt).toLocaleTimeString()}
                </p>
              </div>
              <Badge
                className={cn(
                  req.status === "PENDING"
                    ? "bg-red-500/20 text-red-300"
                    : "bg-emerald-500/20 text-emerald-300",
                )}
              >
                {req.status}
              </Badge>
            </div>
            <div className="flex gap-2 mt-3">
              {req.status === "PENDING" && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={loading}
                  onClick={() => void updateStatus(req.id, "ACKNOWLEDGED")}
                >
                  <Check className="w-3.5 h-3.5 mr-1" />
                  Acknowledge
                </Button>
              )}
              {req.status !== "RESOLVED" && (
                <Button
                  size="sm"
                  disabled={loading}
                  onClick={() => void updateStatus(req.id, "RESOLVED")}
                >
                  <CheckCheck className="w-3.5 h-3.5 mr-1" />
                  Done
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

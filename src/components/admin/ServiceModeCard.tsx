"use client";

import { useEffect, useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import type { OrderFulfillmentMode, RestaurantServiceMode } from "@/lib/fulfillment/constants";

export function ServiceModeCard() {
  const [serviceMode, setServiceMode] = useState<RestaurantServiceMode>("FULL_SERVICE");
  const [hybridDefault, setHybridDefault] = useState<OrderFulfillmentMode>("TABLE_SERVICE");
  const [pickupLabel, setPickupLabel] = useState("Pickup Counter");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    void fetch("/api/restaurant/service-mode")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!json?.settings) return;
        setServiceMode(json.settings.serviceMode);
        setHybridDefault(json.settings.hybridDefaultFulfillment);
        setPickupLabel(json.settings.pickupLocationLabel);
      });
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/restaurant/service-mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceMode,
          hybridDefaultFulfillment: hybridDefault,
          pickupLocationLabel: pickupLabel,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not save");
      setMessage({ type: "ok", text: "Service model saved." });
    } catch (error) {
      setMessage({
        type: "err",
        text: error instanceof Error ? error.message : "Could not save",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="text-lg font-bold">Service Model</h2>
        <p className="text-sm text-zinc-400">
          Existing restaurants stay Full Service unless you change this.
        </p>
      </div>
      <div className="space-y-3">
        {(
          [
            ["FULL_SERVICE", "Full Service", "Staff delivers prepared orders to the table."],
            ["SELF_SERVICE", "Self Service", "Customers collect prepared orders from the pickup counter."],
            ["HYBRID", "Hybrid", "Supports both table service and customer collection."],
          ] as const
        ).map(([value, label, help]) => (
          <label key={value} className="flex items-start gap-3 p-3 rounded-xl border border-white/10">
            <input
              type="radio"
              name="serviceMode"
              checked={serviceMode === value}
              onChange={() => setServiceMode(value)}
              className="mt-1"
            />
            <span>
              <span className="font-medium block">{label}</span>
              <span className="text-sm text-zinc-400">{help}</span>
            </span>
          </label>
        ))}
      </div>
      {(serviceMode === "SELF_SERVICE" || serviceMode === "HYBRID") && (
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Pickup location label</label>
          <Input
            value={pickupLabel}
            maxLength={80}
            onChange={(e) => setPickupLabel(e.target.value)}
            placeholder="Pickup Counter"
          />
        </div>
      )}
      {serviceMode === "HYBRID" && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500">Default fulfillment</p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={hybridDefault === "TABLE_SERVICE"}
              onChange={() => setHybridDefault("TABLE_SERVICE")}
            />
            Table service
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={hybridDefault === "SELF_PICKUP"}
              onChange={() => setHybridDefault("SELF_PICKUP")}
            />
            Self pickup
          </label>
        </div>
      )}
      <Button size="sm" onClick={() => void save()} disabled={saving}>
        {saving ? "Saving..." : "Save service model"}
      </Button>
      {message && (
        <p className={message.type === "ok" ? "text-sm text-emerald-400" : "text-sm text-red-400"}>
          {message.text}
        </p>
      )}
    </Card>
  );
}

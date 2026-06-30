"use client";

import { useState } from "react";
import { Bluetooth, Printer, Loader2, ChefHat } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

type ThermalPrinterButtonProps = {
  status: "unsupported" | "disconnected" | "connected";
  deviceName: string;
  autoPrint: boolean;
  kitchenChitPrint: boolean;
  lastError: string;
  printing: boolean;
  supported: boolean;
  onConnect: () => Promise<void>;
  onToggleAutoPrint: (enabled: boolean) => void;
  onToggleKitchenChitPrint: (enabled: boolean) => void;
};

export function ThermalPrinterButton({
  status,
  deviceName,
  autoPrint,
  kitchenChitPrint,
  lastError,
  printing,
  supported,
  onConnect,
  onToggleAutoPrint,
  onToggleKitchenChitPrint,
}: ThermalPrinterButtonProps) {
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);

  if (!supported) return null;

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await onConnect();
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "p-2 rounded-xl border transition-colors",
          status === "connected"
            ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
            : "bg-white/5 border-white/10 text-zinc-400 hover:text-white",
        )}
        title="Bluetooth receipt printer"
      >
        {printing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-white/10 bg-[#12121c] shadow-2xl p-4 z-50">
          <div className="flex items-center gap-2 mb-3">
            <Bluetooth className="w-4 h-4 text-sky-400" />
            <p className="font-semibold text-white text-sm">Thermal printer</p>
          </div>

          <p className="text-xs text-zinc-400 mb-3">
            Pair once over Bluetooth. Choose what to auto-print when orders are placed or paid.
          </p>

          {deviceName ? (
            <p className="text-sm text-zinc-300 mb-3">
              Saved printer: <span className="text-white">{deviceName}</span>
            </p>
          ) : (
            <p className="text-sm text-zinc-500 mb-3">No printer paired yet.</p>
          )}

          <label className="flex items-center gap-2 text-sm text-zinc-300 mb-2">
            <input
              type="checkbox"
              checked={autoPrint}
              onChange={(event) => onToggleAutoPrint(event.target.checked)}
              className="rounded border-white/20"
            />
            Auto-print customer receipt when bill is fully paid
          </label>

          <label className="flex items-center gap-2 text-sm text-zinc-300 mb-3">
            <ChefHat className="w-4 h-4 text-orange-300" />
            <input
              type="checkbox"
              checked={kitchenChitPrint}
              onChange={(event) => onToggleKitchenChitPrint(event.target.checked)}
              className="rounded border-white/20"
            />
            Auto-print kitchen chit when a new order is sent
          </label>

          <Button
            size="sm"
            className="w-full"
            disabled={connecting || printing}
            onClick={() => void handleConnect()}
          >
            {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Connect Bluetooth printer"}
          </Button>

          {lastError && <p className="text-xs text-red-400 mt-3">{lastError}</p>}

          <p className="text-[11px] text-zinc-500 mt-3">
            Works best in Chrome on Android or desktop. Turn the printer on and keep it in pairing mode.
          </p>
        </div>
      )}
    </div>
  );
}

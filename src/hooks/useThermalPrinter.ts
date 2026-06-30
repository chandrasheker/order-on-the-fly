"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReceiptPayload } from "@/lib/receipt-service";
import type { KitchenChitPayload } from "@/lib/kitchen-chit-service";
import { buildEscPosReceipt } from "@/lib/escpos/build-receipt";
import { buildEscPosKitchenChit } from "@/lib/escpos/build-kitchen-chit";
import {
  BluetoothEscPosPrinter,
  getAutoPrintEnabled,
  getKitchenChitEnabled,
  getSavedPrinterName,
  isWebBluetoothSupported,
  setAutoPrintEnabled,
  setKitchenChitEnabled,
  type PrinterStatus,
} from "@/lib/escpos/bluetooth-printer";

let sharedPrinter: BluetoothEscPosPrinter | null = null;

function getSharedPrinter() {
  if (!sharedPrinter) {
    sharedPrinter = new BluetoothEscPosPrinter();
  }
  return sharedPrinter;
}

export function useThermalPrinter() {
  const [printer] = useState(() => getSharedPrinter());
  const [status, setStatus] = useState<PrinterStatus>("disconnected");
  const [deviceName, setDeviceName] = useState("");
  const [autoPrint, setAutoPrint] = useState(true);
  const [kitchenChitPrint, setKitchenChitPrint] = useState(false);
  const [lastError, setLastError] = useState("");
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!isWebBluetoothSupported()) {
      setStatus("unsupported");
      return;
    }
    setDeviceName(getSavedPrinterName());
    setAutoPrint(getAutoPrintEnabled());
    setKitchenChitPrint(getKitchenChitEnabled());
    setStatus("disconnected");
  }, []);

  const ensureConnected = useCallback(async () => {
    if (!isWebBluetoothSupported()) {
      throw new Error("Web Bluetooth is not supported in this browser");
    }
    if (!printer.connected) {
      await printer.reconnect().catch(async () => {
        await printer.connect({ requestNew: true });
      });
    }
    setDeviceName(printer.deviceName);
    setStatus("connected");
  }, [printer]);

  const connect = useCallback(async () => {
    setLastError("");
    try {
      await printer.connect({ requestNew: true });
      setDeviceName(printer.deviceName);
      setStatus("connected");
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Could not connect printer");
      setStatus("disconnected");
      throw error;
    }
  }, [printer]);

  const sendBytes = useCallback(
    async (bytes: Uint8Array) => {
      setPrinting(true);
      setLastError("");
      try {
        await ensureConnected();
        await printer.print(bytes);
        setDeviceName(printer.deviceName);
        setStatus("connected");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Print failed";
        setLastError(message);
        setStatus("disconnected");
        throw error;
      } finally {
        setPrinting(false);
      }
    },
    [ensureConnected, printer],
  );

  const printReceipt = useCallback(
    async (receipt: ReceiptPayload) => {
      const bytes = await buildEscPosReceipt(receipt);
      await sendBytes(bytes);
    },
    [sendBytes],
  );

  const printKitchenChit = useCallback(
    async (chit: KitchenChitPayload) => {
      const bytes = buildEscPosKitchenChit(chit);
      await sendBytes(bytes);
    },
    [sendBytes],
  );

  const reprintOrderReceipt = useCallback(
    async (orderId: string) => {
      const res = await fetch(`/api/orders/${orderId}/receipt`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Could not load receipt");
      }
      if (!json.receipt) {
        throw new Error("Receipt not available");
      }
      await printReceipt(json.receipt);
    },
    [printReceipt],
  );

  const printKitchenChitForOrder = useCallback(
    async (orderId: string) => {
      const res = await fetch(`/api/orders/${orderId}/kitchen-chit`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Could not load kitchen chit");
      }
      if (!json.chit) {
        throw new Error("Kitchen chit not available");
      }
      await printKitchenChit(json.chit);
    },
    [printKitchenChit],
  );

  const toggleAutoPrint = useCallback((enabled: boolean) => {
    setAutoPrint(enabled);
    setAutoPrintEnabled(enabled);
  }, []);

  const toggleKitchenChitPrint = useCallback((enabled: boolean) => {
    setKitchenChitPrint(enabled);
    setKitchenChitEnabled(enabled);
  }, []);

  return {
    status,
    deviceName,
    autoPrint,
    kitchenChitPrint,
    lastError,
    printing,
    connect,
    printReceipt,
    printKitchenChit,
    reprintOrderReceipt,
    printKitchenChitForOrder,
    toggleAutoPrint,
    toggleKitchenChitPrint,
    supported: status !== "unsupported",
  };
}

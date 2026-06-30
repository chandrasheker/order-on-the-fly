"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReceiptPayload } from "@/lib/receipt-service";
import { buildEscPosReceipt } from "@/lib/escpos/build-receipt";
import {
  BluetoothEscPosPrinter,
  getAutoPrintEnabled,
  getSavedPrinterName,
  isWebBluetoothSupported,
  setAutoPrintEnabled,
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
  const [lastError, setLastError] = useState("");
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!isWebBluetoothSupported()) {
      setStatus("unsupported");
      return;
    }
    setDeviceName(getSavedPrinterName());
    setAutoPrint(getAutoPrintEnabled());
    setStatus(getSavedPrinterName() ? "disconnected" : "disconnected");
  }, []);

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

  const printReceipt = useCallback(
    async (receipt: ReceiptPayload) => {
      if (!isWebBluetoothSupported()) {
        throw new Error("Web Bluetooth is not supported in this browser");
      }

      setPrinting(true);
      setLastError("");
      try {
        if (!printer.connected) {
          await printer.reconnect().catch(async () => {
            await printer.connect({ requestNew: true });
          });
        }
        const bytes = await buildEscPosReceipt(receipt);
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
    [printer],
  );

  const toggleAutoPrint = useCallback((enabled: boolean) => {
    setAutoPrint(enabled);
    setAutoPrintEnabled(enabled);
  }, []);

  return {
    status,
    deviceName,
    autoPrint,
    lastError,
    printing,
    connect,
    printReceipt,
    toggleAutoPrint,
    supported: status !== "unsupported",
  };
}

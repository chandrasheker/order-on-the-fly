const STORAGE_DEVICE_ID = "tabletap-printer-device-id";
const STORAGE_DEVICE_NAME = "tabletap-printer-device-name";
const STORAGE_AUTO_PRINT = "tabletap-auto-print-receipt";
const STORAGE_KITCHEN_CHIT = "tabletap-auto-print-kitchen-chit";

const COMMON_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa7-a7367197ce50",
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
];

export type PrinterStatus = "unsupported" | "disconnected" | "connected";

export function isWebBluetoothSupported() {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export function getAutoPrintEnabled() {
  if (typeof window === "undefined") return true;
  const value = localStorage.getItem(STORAGE_AUTO_PRINT);
  return value !== "false";
}

export function setAutoPrintEnabled(enabled: boolean) {
  localStorage.setItem(STORAGE_AUTO_PRINT, enabled ? "true" : "false");
}

export function getKitchenChitEnabled() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KITCHEN_CHIT) === "true";
}

export function setKitchenChitEnabled(enabled: boolean) {
  localStorage.setItem(STORAGE_KITCHEN_CHIT, enabled ? "true" : "false");
}

export function getSavedPrinterName() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_DEVICE_NAME) ?? "";
}

export class BluetoothEscPosPrinter {
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;

  get connected() {
    return Boolean(this.device?.gatt?.connected && this.characteristic);
  }

  get deviceName() {
    return this.device?.name ?? getSavedPrinterName();
  }

  async connect(options?: { requestNew?: boolean }) {
    if (!isWebBluetoothSupported()) {
      throw new Error("Web Bluetooth is not supported in this browser. Use Chrome on Android or desktop.");
    }

    if (!options?.requestNew) {
      const restored = await this.tryRestoreSavedDevice();
      if (restored) return;
    }

    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: COMMON_SERVICES,
    });

    await this.openDevice(device);
    localStorage.setItem(STORAGE_DEVICE_ID, device.id);
    localStorage.setItem(STORAGE_DEVICE_NAME, device.name ?? "Thermal printer");
  }

  async reconnect() {
    if (this.connected) return;
    const restored = await this.tryRestoreSavedDevice();
    if (!restored) {
      throw new Error("No saved printer. Connect a Bluetooth printer first.");
    }
  }

  async print(data: Uint8Array) {
    if (!this.characteristic) {
      await this.reconnect();
    }
    if (!this.characteristic) {
      throw new Error("Printer not connected");
    }

    const chunkSize = 180;
    for (let offset = 0; offset < data.length; offset += chunkSize) {
      const chunk = data.slice(offset, offset + chunkSize);
      await this.characteristic.writeValue(chunk);
      await delay(25);
    }
  }

  async disconnect() {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.characteristic = null;
  }

  private async tryRestoreSavedDevice() {
    const savedId = localStorage.getItem(STORAGE_DEVICE_ID);
    if (!savedId || !navigator.bluetooth.getDevices) return false;

    const devices = await navigator.bluetooth.getDevices();
    const device = devices.find((entry) => entry.id === savedId);
    if (!device) return false;

    await this.openDevice(device);
    return true;
  }

  private async openDevice(device: BluetoothDevice) {
    const server = await device.gatt?.connect();
    if (!server) {
      throw new Error("Could not connect to printer");
    }

    const services = await server.getPrimaryServices();
    for (const service of services) {
      const characteristics = await service.getCharacteristics();
      const writable = characteristics.find((entry) => entry.properties.writeWithoutResponse || entry.properties.write);
      if (writable) {
        this.device = device;
        this.characteristic = writable;
        return;
      }
    }

    throw new Error("No writable Bluetooth characteristic found on this printer");
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

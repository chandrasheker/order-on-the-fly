import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function loadPrinterMap(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function cupsSpawnSpec(printerName) {
  return { command: "lp", args: ["-d", printerName], options: { shell: false } };
}

export async function printWithCups(printerName, text) {
  if (!printerName || /[^A-Za-z0-9._-]/u.test(printerName)) {
    return { ok: false, errorCode: "PRINTER_NOT_CONFIGURED", errorMessage: "Invalid local printer name" };
  }
  const spec = cupsSpawnSpec(printerName);
  return new Promise((resolve) => {
    const child = spawn(spec.command, spec.args, spec.options);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", () => {
      resolve({ ok: false, errorCode: "PRINTER_OFFLINE", errorMessage: "Print spooler rejected job" });
    });
    child.on("close", (code) => {
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, errorCode: "PRINTER_OFFLINE", errorMessage: "Print spooler rejected job" });
    });
    child.stdin.write(text);
    child.stdin.end();
    void stderr;
  });
}

export async function printToFile(stateDir, target, deliveryKey, text) {
  const dir = path.join(stateDir, "dry-run");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${target}-${deliveryKey}.txt`);
  fs.writeFileSync(file, text);
  return { ok: true, spoolId: file };
}

export async function submitToAdapter(params) {
  const mapping = params.mapping;
  if (!mapping) {
    return { ok: false, errorCode: "PRINTER_NOT_CONFIGURED", errorMessage: `Printer not configured for "${params.target}"` };
  }
  if (params.dryRun || mapping.adapter === "file" || mapping.adapter === "dry-run") {
    return printToFile(params.stateDir, params.target, params.deliveryKey, params.text);
  }
  if (mapping.adapter === "cups") {
    return printWithCups(mapping.printer, params.text);
  }
  return { ok: false, errorCode: "UNSUPPORTED_JOB", errorMessage: "Unsupported local printer adapter" };
}

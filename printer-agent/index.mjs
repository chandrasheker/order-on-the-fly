#!/usr/bin/env node
import path from "node:path";
import { assertServerUrl, claimJob, nextBackoff, redactLogs, reportResult } from "./lib/client.mjs";
import { loadPrinterMap } from "./lib/adapters.mjs";
import { processClaimedJob } from "./lib/process-job.mjs";

const VERSION = "0.1.0";
const token = process.env.TABLETAP_PRINTER_AGENT_TOKEN ?? "";
const pollMs = Number(process.env.TABLETAP_PRINTER_POLL_MS ?? 2000);
const stateDir = process.env.TABLETAP_PRINTER_AGENT_STATE_DIR ?? path.join(process.cwd(), ".printer-agent-state");
const mapFile = process.env.TABLETAP_PRINTER_MAP ?? path.join(process.cwd(), "printer-agent/printers.example.json");
const dryRun = process.env.TABLETAP_PRINTER_DRY_RUN === "1";

function log(...args) {
  console.log("[printer-agent]", new Date().toISOString(), ...redactLogs(args));
}

let stopping = false;
let delayMs = pollMs;

function handleSignal(signal) {
  log(`received ${signal}, stopping after current job`);
  stopping = true;
}

process.on("SIGINT", () => handleSignal("SIGINT"));
process.on("SIGTERM", () => handleSignal("SIGTERM"));

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!token) {
    console.error("TABLETAP_PRINTER_AGENT_TOKEN is required");
    process.exit(1);
  }
  const serverUrl = assertServerUrl(process.env.TABLETAP_SERVER_URL ?? "http://localhost:3000");
  const printers = loadPrinterMap(mapFile);
  log("starting", dryRun ? "dry-run" : "live", serverUrl);

  while (!stopping) {
    try {
      const claimed = await claimJob({ serverUrl, token, version: VERSION });
      delayMs = Number(claimed.pollAfterMs ?? pollMs) || pollMs;
      if (claimed.job) {
        const result = await processClaimedJob({
          job: claimed.job,
          mapping: printers[claimed.job.target],
          stateDir,
          dryRun,
        });
        await reportResult({
          serverUrl,
          token,
          jobId: claimed.job.id,
          claimToken: claimed.job.claimToken,
          outcome: result.outcome,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        });
        log("job result", result.outcome, claimed.job.id);
      }
    } catch (error) {
      delayMs = nextBackoff(delayMs);
      log("poll failed, backing off", String(error?.message ?? error));
    }
    if (stopping) break;
    await sleep(delayMs);
  }
}

main().catch((error) => {
  console.error("[printer-agent]", String(error?.message ?? error));
  process.exit(1);
});

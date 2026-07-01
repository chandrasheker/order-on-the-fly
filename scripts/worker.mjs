#!/usr/bin/env node
/**
 * Background worker — processes job queue, print retries, and optional reconciliation.
 * Run: npm run worker
 * Env: WORKER_INTERVAL_MS (default 5000), APP_URL (default http://localhost:3000)
 */
import "dotenv/config";

const APP_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const INTERVAL = Number(process.env.WORKER_INTERVAL_MS ?? 5000);
const SECRET = process.env.JOB_CRON_SECRET;

async function tick() {
  const headers = { "Content-Type": "application/json" };
  if (SECRET) headers.Authorization = `Bearer ${SECRET}`;

  try {
    const jobsRes = await fetch(`${APP_URL}/api/jobs/process`, {
      method: "POST",
      headers,
    });
    const jobsJson = await jobsRes.json().catch(() => ({}));
    if (jobsJson.processed > 0) {
      console.log(`[worker] processed ${jobsJson.processed} job(s)`);
    }
  } catch (err) {
    console.warn("[worker] jobs/process unreachable:", err.message);
  }

  try {
    const printRes = await fetch(`${APP_URL}/api/print/retry`, {
      method: "POST",
      headers,
    });
    const printJson = await printRes.json().catch(() => ({}));
    if (printJson.retried > 0) {
      console.log(`[worker] retried ${printJson.retried} print job(s)`);
    }
  } catch {
    /* print retry route optional when app starting */
  }
}

console.log(`[worker] Starting — polling every ${INTERVAL}ms → ${APP_URL}`);
void tick();
setInterval(tick, INTERVAL);

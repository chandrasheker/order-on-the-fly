#!/usr/bin/env node
/**
 * Wraps Node commands with heap limits tuned for low-RAM hosts (e.g. 1 GB + swap).
 * Auto-enables LOW_MEMORY when total RAM <= 1.5 GB unless LOW_MEMORY=0.
 *
 * Usage: node scripts/run-with-mem.js <command> [args...]
 * Example: node scripts/run-with-mem.js npx next build
 */
const { spawnSync } = require("node:child_process");
const os = require("node:os");

const totalMemMb = Math.round(os.totalmem() / 1024 / 1024);

function commandLine(args) {
  return args.join(" ").toLowerCase();
}

function shouldUseLowMemoryProfile() {
  if (process.env.LOW_MEMORY === "0") return false;
  if (process.env.LOW_MEMORY === "1") return true;
  return totalMemMb <= 1536;
}

function heapLimitMb(args) {
  if (process.env.NODE_MAX_OLD_SPACE_SIZE) {
    return Number(process.env.NODE_MAX_OLD_SPACE_SIZE);
  }

  const cmd = commandLine(args);
  if (cmd.includes("next build")) {
    return totalMemMb <= 1024 ? 640 : totalMemMb <= 2048 ? 1024 : 2048;
  }
  if (cmd.includes("next dev")) {
    return totalMemMb <= 1024 ? 448 : 768;
  }
  if (cmd.includes("next start")) {
    return totalMemMb <= 1024 ? 384 : 512;
  }
  if (cmd.includes("prisma")) {
    return 384;
  }
  if (cmd.includes("tsc") || cmd.includes("tsx") || cmd.includes("eslint")) {
    return totalMemMb <= 1024 ? 512 : 768;
  }
  return totalMemMb <= 1024 ? 512 : 768;
}

function applyMemoryEnv(args) {
  const lowMemory = shouldUseLowMemoryProfile();
  if (lowMemory) {
    process.env.LOW_MEMORY = "1";
    process.env.NEXT_TELEMETRY_DISABLED = "1";
    process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || "2";
  }

  const limit = heapLimitMb(args);
  const existing = process.env.NODE_OPTIONS || "";
  if (!/--max-old-space-size=\d+/.test(existing)) {
    process.env.NODE_OPTIONS = `${existing} --max-old-space-size=${limit}`.trim();
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/run-with-mem.js <command> [args...]");
  process.exit(1);
}

applyMemoryEnv(args);

if (shouldUseLowMemoryProfile()) {
  console.log(
    `[run-with-mem] low-memory profile (${totalMemMb} MB RAM, heap <= ${heapLimitMb(args)} MB): ${args.join(" ")}`,
  );
}

const [command, ...commandArgs] = args;
const result = spawnSync(command, commandArgs, {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);

#!/usr/bin/env node
/**
 * Production build in separate processes to keep peak memory low on 1 GB hosts.
 * 1) prisma generate  2) next build
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const runWithMem = path.join(__dirname, "run-with-mem.js");

function runStep(label, command, args) {
  console.log(`\n[build-sequential] ${label}`);
  const result = spawnSync(process.execPath, [runWithMem, command, ...args], {
    stdio: "inherit",
    env: {
      ...process.env,
      // Page-data workers inherit this so placeholder JWT_SECRET cannot abort `next build`.
      TABLETAP_PRODUCTION_BUILD: "1",
    },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runStep("Generating Prisma client", "npx", ["prisma", "generate"]);
runStep("Building Next.js app", "npx", ["next", "build", "--webpack"]);

#!/usr/bin/env node
const { spawn } = require("node:child_process");
const { execSync } = require("node:child_process");
const { installCrashHandlers, collectCrashDump } = require("./crash-dump");
const { logInfo, logError, logWarn } = require("./logger");

require("dotenv/config");
require("./ensure-env.js");

const args = process.argv.slice(2);

function printHelp() {
  console.log(`
TableTap server starter

Usage:
  node scripts/start-server.js [options]

Options:
  --pull       Run git pull before starting
  --no-clean   Skip database reset (runs db:setup only)
  --prod       Run production build + next start (no DB reset unless omitted with --no-clean)
  --help       Show this help

Default behavior:
  1. Reset database (fresh seed)
  2. Start Next.js dev server
  3. On crash, save debug dump under logs/crashes/

Examples:
  node scripts/start-server.js --pull
  node scripts/start-server.js --pull --no-clean
  npm run start:clean
`);
}

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

const shouldPull = args.includes("--pull");
const keepDb = args.includes("--no-clean");
const production = args.includes("--prod");

installCrashHandlers("start-server");

function run(command, label) {
  logInfo("start-server", label);
  execSync(command, { stdio: "inherit", cwd: process.cwd() });
}

async function main() {
  logInfo("start-server", "TableTap server starting", {
    pull: shouldPull,
    cleanDb: !keepDb,
    mode: production ? "production" : "development",
  });

  if (shouldPull) {
    try {
      run("git pull", "Pulling latest code from git");
    } catch (err) {
      logWarn("start-server", "git pull failed; continuing with local code", {
        error: err.message,
      });
    }
  }

  if (keepDb) {
    run("npm run db:setup", "Running database setup (keeping existing data)");
  } else {
    run("npm run db:reset", "Resetting database for a clean start");
  }

  if (production) {
    run("npm run build", "Building production bundle");
  }

  const nextArgs = production ? ["next", "start"] : ["next", "dev"];
  logInfo("start-server", `Launching: npx ${nextArgs.join(" ")}`);

  const child = spawn("npx", nextArgs, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (code !== 0 && code !== null) {
      const dumpDir = collectCrashDump({
        source: "next-process",
        reason: `Next.js exited with code ${code}`,
        signal,
      });
      logError("start-server", "Server process exited unexpectedly", {
        code,
        signal,
        dumpDir,
      });
    } else if (signal) {
      logWarn("start-server", `Server stopped by signal ${signal}`);
    } else {
      logInfo("start-server", "Server stopped normally");
    }
    process.exit(code ?? (signal ? 1 : 0));
  });

  child.on("error", (err) => {
    collectCrashDump({ source: "next-process", error: err, reason: "spawn failed" });
    logError("start-server", "Failed to start Next.js process", { error: err.message });
    process.exit(1);
  });
}

main().catch((err) => {
  collectCrashDump({ source: "start-server", error: err, reason: "startup failed" });
  logError("start-server", "Startup failed", { error: err.message });
  process.exit(1);
});

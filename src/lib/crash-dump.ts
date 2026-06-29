import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { getDatabaseFilePath } from "@/lib/db-url";
import { logError, logInfo } from "@/lib/logger";

const LOG_DIR = path.join(process.cwd(), "logs");
export const CRASH_DIR = path.join(LOG_DIR, "crashes");
const LOG_FILE = path.join(LOG_DIR, "app.log");

let collecting = false;

function safeExec(command: string) {
  try {
    return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

function sanitizeEnv() {
  const hidden = new Set([
    "JWT_SECRET",
    "DATABASE_URL",
    "AUTH_SECRET",
    "NEXTAUTH_SECRET",
  ]);
  const env: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    env[key] = hidden.has(key) ? "[REDACTED]" : value;
  }
  return env;
}

function readRecentLogs(maxLines = 300) {
  if (!fs.existsSync(LOG_FILE)) return "";
  const lines = fs.readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean);
  return lines.slice(-maxLines).join("\n");
}

function exportDatabaseJson(dbPath: string) {
  if (!fs.existsSync(dbPath)) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });
    const rows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%' ORDER BY name"
      )
      .all() as Array<{ name: string }>;
    const tables = rows.map((row) => row.name);

    const snapshot: Record<string, unknown> = {};
    for (const table of tables) {
      snapshot[table] = db.prepare(`SELECT * FROM "${table}"`).all();
    }
    db.close();
    return snapshot;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function copyIfExists(source: string, targetDir: string) {
  if (!fs.existsSync(source)) return false;
  fs.copyFileSync(source, path.join(targetDir, path.basename(source)));
  return true;
}

interface CrashDumpOptions {
  source?: string;
  reason?: string | null;
  signal?: NodeJS.Signals | null;
  message?: string | null;
  stack?: string | null;
  error?: unknown;
  extra?: unknown;
}

export function collectCrashDump(options: CrashDumpOptions = {}) {
  if (collecting) return null;
  collecting = true;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dumpDir = path.join(CRASH_DIR, timestamp);
  fs.mkdirSync(dumpDir, { recursive: true });

  const error = options.error;
  const report = {
    collectedAt: new Date().toISOString(),
    source: options.source || "unknown",
    reason: options.reason || null,
    signal: options.signal || null,
    message: error instanceof Error ? error.message : options.message || null,
    stack: error instanceof Error ? error.stack : options.stack || null,
    pid: process.pid,
    ppid: process.ppid,
    cwd: process.cwd(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    memoryUsage: process.memoryUsage(),
    uptimeSeconds: process.uptime(),
    git: {
      branch: safeExec("git rev-parse --abbrev-ref HEAD"),
      commit: safeExec("git rev-parse HEAD"),
      status: safeExec("git status --short"),
    },
    env: sanitizeEnv(),
    extra: options.extra || null,
  };

  fs.writeFileSync(
    path.join(dumpDir, "crash-report.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );

  const dbPath = getDatabaseFilePath();
  const copiedDb = copyIfExists(dbPath, dumpDir);
  copyIfExists(`${dbPath}-journal`, dumpDir);
  copyIfExists(`${dbPath}-wal`, dumpDir);
  copyIfExists(`${dbPath}-shm`, dumpDir);

  const snapshot = exportDatabaseJson(dbPath);
  if (snapshot) {
    fs.writeFileSync(
      path.join(dumpDir, "database-snapshot.json"),
      JSON.stringify(snapshot, null, 2),
      "utf8"
    );
  }

  const recentLogs = readRecentLogs(300);
  if (recentLogs) {
    fs.writeFileSync(path.join(dumpDir, "recent-logs.txt"), recentLogs, "utf8");
  }

  fs.writeFileSync(
    path.join(dumpDir, "README.txt"),
    [
      "TableTap crash dump",
      "===================",
      "",
      `Collected: ${report.collectedAt}`,
      `Source: ${report.source}`,
      `Reason: ${report.reason || report.message || "unknown"}`,
      "",
      "Files:",
      "- crash-report.json   Process, git, and environment details",
      "- database-snapshot.json   All DB tables exported as JSON",
      copiedDb
        ? `- ${path.basename(dbPath)}   Raw SQLite database copy`
        : "- (database file was not found)",
      "- recent-logs.txt     Last ~300 log lines before the crash",
    ].join("\n"),
    "utf8"
  );

  logError("crash-dump", `Crash dump saved to ${dumpDir}`, {
    source: report.source,
    reason: report.reason || report.message,
  });

  collecting = false;
  return dumpDir;
}

export function installCrashHandlers(source: string) {
  const handler = (label: string) => (error: Error) => {
    logError(source, `${label}: ${error.message}`, { stack: error.stack });
    try {
      collectCrashDump({ source, error, reason: label });
    } catch (dumpError) {
      console.error("Failed to collect crash dump:", dumpError);
    }
  };

  process.on("uncaughtException", handler("uncaughtException"));
  process.on("unhandledRejection", (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    handler("unhandledRejection")(error);
  });

  logInfo(source, "Crash handlers installed; dumps go to logs/crashes/");
}

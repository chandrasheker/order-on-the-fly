const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const { logError, logInfo, readRecentLogs, LOG_DIR } = require("./logger");

const CRASH_DIR = path.join(LOG_DIR, "crashes");
let collecting = false;

function resolveDbPath() {
  require("dotenv/config");
  const raw = process.env.DATABASE_URL || "file:./dev.db";
  const filePath = raw.startsWith("file:") ? raw.slice(5) : raw;
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
}

function safeExec(command) {
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
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    env[key] = hidden.has(key) ? "[REDACTED]" : value;
  }
  return env;
}

function exportDatabaseJson(dbPath) {
  if (!fs.existsSync(dbPath)) return null;

  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%' ORDER BY name"
      )
      .all()
      .map((row) => row.name);

    const snapshot = {};
    for (const table of tables) {
      snapshot[table] = db.prepare(`SELECT * FROM "${table}"`).all();
    }
    db.close();
    return snapshot;
  } catch (err) {
    return { error: err.message };
  }
}

function copyIfExists(source, targetDir) {
  if (!fs.existsSync(source)) return false;
  fs.copyFileSync(source, path.join(targetDir, path.basename(source)));
  return true;
}

function collectCrashDump(options = {}) {
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

  const dbPath = resolveDbPath();
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
      copiedDb ? `- ${path.basename(dbPath)}   Raw SQLite database copy` : "- (database file was not found)",
      "- recent-logs.txt     Last ~300 log lines before the crash",
      "",
      "To inspect the DB copy:",
      `  sqlite3 "${path.join(dumpDir, path.basename(dbPath))}"`,
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

function installCrashHandlers(source) {
  const handler = (label) => (error) => {
    logError(source, `${label}: ${error?.message || error}`, {
      stack: error?.stack,
    });
    try {
      collectCrashDump({ source, error, reason: label });
    } catch (dumpError) {
      console.error("Failed to collect crash dump:", dumpError);
    }
  };

  process.on("uncaughtException", handler("uncaughtException"));
  process.on("unhandledRejection", (reason) => {
    const error =
      reason instanceof Error ? reason : new Error(String(reason));
    handler("unhandledRejection")(error);
  });

  logInfo(source, "Crash handlers installed; dumps go to logs/crashes/");
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const reasonIdx = args.indexOf("--reason");
  const reason = reasonIdx >= 0 ? args[reasonIdx + 1] : args.join(" ") || "manual";
  const dumpDir = collectCrashDump({ source: "cli", reason });
  if (dumpDir) {
    console.log(`Crash dump written to: ${dumpDir}`);
  }
}

module.exports = {
  collectCrashDump,
  installCrashHandlers,
  CRASH_DIR,
};

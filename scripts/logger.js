const fs = require("node:fs");
const path = require("node:path");

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "app.log");

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function formatLine(level, context, message, meta) {
  const ts = new Date().toISOString();
  const metaStr =
    meta !== undefined ? ` ${JSON.stringify(meta)}` : "";
  return `[${ts}] [${level.toUpperCase()}] [${context}] ${message}${metaStr}`;
}

function write(level, context, message, meta) {
  ensureLogDir();
  const line = formatLine(level, context, message, meta);
  const printer =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;
  printer(line);
  try {
    fs.appendFileSync(LOG_FILE, `${line}\n`, "utf8");
  } catch (err) {
    console.error("Failed to write log file:", err.message);
  }
}

function logInfo(context, message, meta) {
  write("info", context, message, meta);
}

function logWarn(context, message, meta) {
  write("warn", context, message, meta);
}

function logError(context, message, meta) {
  write("error", context, message, meta);
}

function logDebug(context, message, meta) {
  if (process.env.DEBUG === "1" || process.env.DEBUG === "true") {
    write("debug", context, message, meta);
  }
}

function readRecentLogs(maxLines = 200) {
  if (!fs.existsSync(LOG_FILE)) return "";
  const lines = fs.readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean);
  return lines.slice(-maxLines).join("\n");
}

module.exports = {
  LOG_DIR,
  LOG_FILE,
  logInfo,
  logWarn,
  logError,
  logDebug,
  readRecentLogs,
};

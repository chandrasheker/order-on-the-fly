import fs from "node:fs";
import path from "node:path";

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "app.log");

type LogLevel = "info" | "warn" | "error" | "debug";

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function formatLine(
  level: LogLevel,
  context: string,
  message: string,
  meta?: Record<string, unknown>
) {
  const ts = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  return `[${ts}] [${level.toUpperCase()}] [${context}] ${message}${metaStr}`;
}

function write(
  level: LogLevel,
  context: string,
  message: string,
  meta?: Record<string, unknown>
) {
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
    console.error("Failed to write log file:", err);
  }
}

export function logInfo(
  context: string,
  message: string,
  meta?: Record<string, unknown>
) {
  write("info", context, message, meta);
}

export function logWarn(
  context: string,
  message: string,
  meta?: Record<string, unknown>
) {
  write("warn", context, message, meta);
}

export function logError(
  context: string,
  message: string,
  meta?: Record<string, unknown>
) {
  write("error", context, message, meta);
}

export function logDebug(
  context: string,
  message: string,
  meta?: Record<string, unknown>
) {
  if (process.env.DEBUG === "1" || process.env.DEBUG === "true") {
    write("debug", context, message, meta);
  }
}

export function logApiRequest(
  route: string,
  method: string,
  meta?: Record<string, unknown>
) {
  logInfo(`api:${route}`, `${method} request`, meta);
}

export function logApiError(
  route: string,
  method: string,
  error: unknown,
  meta?: Record<string, unknown>
) {
  const err = error instanceof Error ? error : new Error(String(error));
  logError(`api:${route}`, `${method} failed: ${err.message}`, {
    ...meta,
    stack: err.stack,
  });
}

export { LOG_DIR, LOG_FILE };

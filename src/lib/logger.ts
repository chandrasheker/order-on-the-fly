import fs from "node:fs";
import path from "node:path";
import { forensicContextIds } from "@/platform/forensics/request-context";
import { redactSecrets, sanitizeErrorText } from "@/platform/forensics/redactor";
import { FORENSIC_LIMITS } from "@/platform/forensics/constants";

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "app.log");

type LogLevel = "info" | "warn" | "error" | "debug";

function sanitizeMeta(meta?: Record<string, unknown>) {
  const ids = forensicContextIds();
  const merged = { ...ids, ...(meta ?? {}) };
  const redacted = redactSecrets(merged) as Record<string, unknown>;
  if (typeof redacted.stack === "string") {
    redacted.stack = sanitizeErrorText(redacted.stack, FORENSIC_LIMITS.stack);
  }
  return redacted;
}

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
  const safeMeta = sanitizeMeta(meta);
  const metaStr = Object.keys(safeMeta).length ? ` ${JSON.stringify(safeMeta)}` : "";
  return `[${ts}] [${level.toUpperCase()}] [${context}] ${message}${metaStr}`;
}

function write(
  level: LogLevel,
  context: string,
  message: string,
  meta?: Record<string, unknown>
) {
  const line = formatLine(level, context, message, meta);
  const printer =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;
  printer(line);

  const logToFile =
    process.env.LOG_TO_FILE === "1" ||
    process.env.NODE_ENV === "production" ||
    level === "error" ||
    level === "warn";

  if (!logToFile) return;

  try {
    ensureLogDir();
    if (level === "error") {
      fs.appendFileSync(LOG_FILE, `${line}\n`, "utf8");
    } else {
      fs.appendFile(LOG_FILE, `${line}\n`, "utf8", () => undefined);
    }
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
  logDebug(`api:${route}`, `${method} request`, meta);
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

export { formatLine as formatOperationalLogLine, LOG_DIR, LOG_FILE };

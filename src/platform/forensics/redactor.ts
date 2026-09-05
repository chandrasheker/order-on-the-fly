const REDACTED = "[REDACTED]";

const EXACT_DENY = new Set(
  [
    "password",
    "passwordhash",
    "authorization",
    "cookie",
    "set-cookie",
    "jwt",
    "token",
    "accesstoken",
    "refreshtoken",
    "secret",
    "apikey",
    "api_key",
    "privatekey",
    "private_key",
    "clientsecret",
    "webhooksecret",
    "signaturesecret",
    "printeragenttoken",
    "tokenhash",
    "otp",
    "pin",
    "credential",
    "credentials",
    "rawbody",
    "rawrequest",
    "encryptedblob",
    "paymentgatewaysecretenc",
    "paymentwebhooksecretenc",
    "paymentwebhooksecret",
    "publictoken",
    "qrtoken",
    "resettoken",
    "accesskeyid",
    "secretaccesskey",
    "awsaccesskeyid",
    "awssecretaccesskey",
    "menumedias3accesskeyid",
    "menumedias3secretaccesskey",
  ].map((key) => key.toLowerCase()),
);

const SENSITIVE_KEY =
  /(password|secret|token|authorization|cookie|jwt|apikey|api[_-]?key|private[_-]?key|credential|otp|^pin$|signature|access[_-]?key)/i;

const ALLOW_EXACT = new Set(
  [
    "publictokenpresent",
    "tokenrotated",
    "secretchanged",
    "gatewaysecretchanged",
    "webhooksecretchanged",
    "passwordchanged",
    "configured",
    "webhookconfigured",
    "automaticavailable",
  ].map((key) => key.toLowerCase()),
);

const ALLOW_SUFFIX = /(present|changed|rotated|configured)$/i;

function normalizeKey(key: string) {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export function isSensitiveAuditKey(key: string) {
  const compact = normalizeKey(key);
  if (ALLOW_EXACT.has(compact) || ALLOW_SUFFIX.test(compact)) return false;
  if (EXACT_DENY.has(compact) || EXACT_DENY.has(key.toLowerCase())) return true;
  return SENSITIVE_KEY.test(key) || SENSITIVE_KEY.test(compact);
}

export function redactSecrets<T>(value: T): T {
  return redactValue(value, 0) as T;
}

function redactValue(value: unknown, depth: number): unknown {
  if (depth > 12 || value == null) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveAuditKey(key) ? REDACTED : redactValue(child, depth + 1);
    }
    return out;
  }
  return String(value);
}

export function sanitizeErrorText(value: unknown, max = 2048) {
  const raw = value instanceof Error ? value.message : String(value ?? "");
  const redacted = raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/([?&](?:token|secret|key|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/\b(?:token|secret|password|api[_-]?key)=[^\s&]+/gi, "[REDACTED]")
    .replace(/tt_pa_[A-Za-z0-9_]+/g, "[REDACTED]");
  return redacted.length > max ? `${redacted.slice(0, max)}…` : redacted;
}

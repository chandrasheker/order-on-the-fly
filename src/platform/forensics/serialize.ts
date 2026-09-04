import { redactSecrets } from "@/platform/forensics/redactor";

export function boundString(value: string | null | undefined, max: number): string | null {
  if (value == null) return null;
  const trimmed = String(value);
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export function serializeAuditJson(value: unknown, maxBytes: number): string | null {
  if (value === undefined || value === null) return null;
  const redacted = redactSecrets(value);
  const encoded = JSON.stringify(redacted);
  if (encoded == null) return null;
  if (Buffer.byteLength(encoded, "utf8") <= maxBytes) return encoded;

  if (redacted && typeof redacted === "object" && !Array.isArray(redacted)) {
    const marked = { ...(redacted as Record<string, unknown>), _truncated: true };
    const withMarker = JSON.stringify(marked);
    if (Buffer.byteLength(withMarker, "utf8") <= maxBytes) return withMarker;
  }

  const budget = Math.max(32, maxBytes - 32);
  let cut = encoded.slice(0, budget);
  while (Buffer.byteLength(cut, "utf8") > budget) {
    cut = cut.slice(0, Math.max(0, cut.length - 16));
  }
  return `${cut}…","_truncated":true}`;
}

export function parseAuditJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

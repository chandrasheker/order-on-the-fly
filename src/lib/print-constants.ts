export const PRINT_KIND = {
  KITCHEN_CHIT: "kitchen_chit",
  CUSTOMER_BILL: "customer_bill",
} as const;

export const PRINT_TARGET = {
  KITCHEN: "kitchen",
  BILL: "bill",
} as const;

export const PRINT_TARGETS = [PRINT_TARGET.KITCHEN, PRINT_TARGET.BILL] as const;
export type PrintTarget = (typeof PRINT_TARGETS)[number];

export const PRINT_DELIVERY_MODE = {
  AGENT_PULL: "agent-pull",
  LEGACY_PUSH: "legacy-push",
} as const;

export const PRINT_LEASE_MS = 90_000;
export const PRINT_AGENT_ONLINE_MS = 30_000;
export const PRINT_IDLE_POLL_MS = 2_000;
export const PRINT_CLAIM_CANDIDATES = 8;
export const PRINT_PAYLOAD_VERSION = 1;

export const PRINT_BACKOFF_MS = [5_000, 15_000, 30_000, 60_000, 120_000] as const;

export const PRINT_ERROR = {
  PRINTER_OFFLINE: "PRINTER_OFFLINE",
  SPOOL_TIMEOUT: "SPOOL_TIMEOUT",
  TEMPORARY_NETWORK: "TEMPORARY_NETWORK",
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  UNSUPPORTED_JOB: "UNSUPPORTED_JOB",
  PRINTER_NOT_CONFIGURED: "PRINTER_NOT_CONFIGURED",
  AMBIGUOUS_DELIVERY: "AMBIGUOUS_DELIVERY",
} as const;

const TERMINAL_ERRORS = new Set<string>([
  PRINT_ERROR.INVALID_PAYLOAD,
  PRINT_ERROR.UNSUPPORTED_JOB,
  PRINT_ERROR.PRINTER_NOT_CONFIGURED,
  PRINT_ERROR.AMBIGUOUS_DELIVERY,
]);

export function isTerminalPrintError(code?: string | null) {
  return Boolean(code && TERMINAL_ERRORS.has(code));
}

export function printDeliveryMode(env = process.env) {
  return env.PRINT_DELIVERY_MODE === PRINT_DELIVERY_MODE.LEGACY_PUSH
    ? PRINT_DELIVERY_MODE.LEGACY_PUSH
    : PRINT_DELIVERY_MODE.AGENT_PULL;
}

export function isLegacyPrintPushEnabled(env = process.env) {
  return printDeliveryMode(env) === PRINT_DELIVERY_MODE.LEGACY_PUSH;
}

export function targetFromKind(kind?: string | null) {
  return kind === PRINT_KIND.CUSTOMER_BILL ? PRINT_TARGET.BILL : PRINT_TARGET.KITCHEN;
}

export function kitchenChitIdempotencyKey(orderId: string) {
  return `kot:${orderId}:kitchen_chit`;
}

export function customerBillIdempotencyKey(billId: string) {
  return `bill:${billId}:customer_bill`;
}

export function nextPrintAttemptAt(attempts: number, from = Date.now()) {
  const index = Math.min(Math.max(attempts - 1, 0), PRINT_BACKOFF_MS.length - 1);
  return new Date(from + PRINT_BACKOFF_MS[index]);
}

export function parseAllowedTargets(raw?: string | null): PrintTarget[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [...PRINT_TARGETS];
    const allowed = parsed.filter((item): item is PrintTarget =>
      PRINT_TARGETS.includes(item as PrintTarget),
    );
    return allowed.length ? allowed : [...PRINT_TARGETS];
  } catch {
    return [...PRINT_TARGETS];
  }
}

export function publicPrintErrorMessage(code?: string | null, fallback?: string | null) {
  switch (code) {
    case PRINT_ERROR.PRINTER_OFFLINE:
      return "Printer offline";
    case PRINT_ERROR.PRINTER_NOT_CONFIGURED:
      return fallback || "Printer not configured";
    case PRINT_ERROR.SPOOL_TIMEOUT:
      return "Print spooler rejected job";
    case PRINT_ERROR.TEMPORARY_NETWORK:
      return "Printer agent offline";
    case PRINT_ERROR.AMBIGUOUS_DELIVERY:
      return "Delivery state uncertain — verify paper output before reprinting";
    case PRINT_ERROR.INVALID_PAYLOAD:
    case PRINT_ERROR.UNSUPPORTED_JOB:
      return "Automatic retries exhausted";
    default:
      return fallback || "Print delivery failed";
  }
}

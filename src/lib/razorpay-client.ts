import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { RAZORPAY_API_BASE } from "@/lib/gateway-constants";

const REQUEST_TIMEOUT_MS = 15_000;

export type RazorpayRequest = {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  idempotencyKey?: string;
  refundIdempotencyKey?: string;
  auth: { keyId: string; keySecret: string };
};

export const RAZORPAY_REFUND_IDEMPOTENCY_HEADER = "X-Refund-Idempotency";
const RAZORPAY_REFUND_KEY_RE = /^[A-Za-z0-9_-]{10,64}$/;

export function isValidRazorpayRefundIdempotencyKey(value: string) {
  return RAZORPAY_REFUND_KEY_RE.test(value);
}

export function createRazorpayRefundIdempotencyKey() {
  return `tabletap-refund-${randomUUID()}`;
}

export function normalizeRazorpayRefundIdempotencyKey(raw?: string | null) {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  if (!isValidRazorpayRefundIdempotencyKey(trimmed)) return null;
  return trimmed;
}

export type RazorpayHttpResult = {
  status: number;
  json: unknown;
  retryable: boolean;
};

export type RazorpayHttpTransport = (req: RazorpayRequest) => Promise<RazorpayHttpResult>;

export type RazorpayFailureKind = "retryable" | "permanent";

export class RazorpayApiError extends Error {
  readonly kind: RazorpayFailureKind;
  readonly status: number;
  constructor(message: string, kind: RazorpayFailureKind, status: number) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

function classifyStatus(status: number): { retryable: boolean } {
  if (status === 408 || status === 429 || status >= 500) return { retryable: true };
  return { retryable: false };
}

export const defaultRazorpayTransport: RazorpayHttpTransport = async (req) => {
  const url = `${RAZORPAY_API_BASE}${req.path}`;
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`${req.auth.keyId}:${req.auth.keySecret}`).toString("base64")}`,
    Accept: "application/json",
  };
  if (req.body !== undefined) headers["Content-Type"] = "application/json";
  if (req.refundIdempotencyKey) headers[RAZORPAY_REFUND_IDEMPOTENCY_HEADER] = req.refundIdempotencyKey;
  if (req.idempotencyKey) headers["Idempotency-Key"] = req.idempotencyKey;

  try {
    const response = await fetch(url, {
      method: req.method,
      headers,
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    return { status: response.status, json, retryable: classifyStatus(response.status).retryable };
  } catch {
    return { status: 0, json: null, retryable: true };
  }
};

let transport: RazorpayHttpTransport = defaultRazorpayTransport;

export function setRazorpayTransportForTests(next: RazorpayHttpTransport | null) {
  transport = next ?? defaultRazorpayTransport;
}

function errorMessageFromBody(json: unknown, fallback: string) {
  if (json && typeof json === "object") {
    const error = (json as { error?: { description?: string; code?: string } }).error;
    if (error?.description) return error.description;
    if (error?.code) return error.code;
  }
  return fallback;
}

async function razorpayRequest<T>(req: RazorpayRequest): Promise<T> {
  const result = await transport(req);
  if (result.status >= 200 && result.status < 300) {
    return result.json as T;
  }
  throw new RazorpayApiError(
    errorMessageFromBody(result.json, `Razorpay request failed (${result.status || "network"})`),
    result.retryable ? "retryable" : "permanent",
    result.status,
  );
}

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt?: string;
};

export type RazorpayPayment = {
  id: string;
  order_id?: string;
  amount: number;
  currency: string;
  status: string;
};

export type RazorpayRefund = {
  id: string;
  payment_id: string;
  amount: number;
  status: string;
};

export async function razorpayCreateOrder(params: {
  auth: { keyId: string; keySecret: string };
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
}) {
  return razorpayRequest<RazorpayOrder>({
    method: "POST",
    path: "/orders",
    auth: params.auth,
    body: {
      amount: params.amountPaise,
      currency: "INR",
      receipt: params.receipt,
      payment_capture: 1,
      notes: params.notes,
    },
  });
}

export async function razorpayFetchOrder(auth: { keyId: string; keySecret: string }, orderId: string) {
  return razorpayRequest<RazorpayOrder>({
    method: "GET",
    path: `/orders/${encodeURIComponent(orderId)}`,
    auth,
  });
}

export async function razorpayFetchOrderByReceipt(auth: { keyId: string; keySecret: string }, receipt: string) {
  const payload = await razorpayRequest<{ items?: RazorpayOrder[] }>({
    method: "GET",
    path: `/orders?receipt=${encodeURIComponent(receipt)}&count=1`,
    auth,
  });
  return payload.items?.[0] ?? null;
}

export async function razorpayFetchPayment(auth: { keyId: string; keySecret: string }, paymentId: string) {
  return razorpayRequest<RazorpayPayment>({
    method: "GET",
    path: `/payments/${encodeURIComponent(paymentId)}`,
    auth,
  });
}

export async function razorpayCreateRefund(params: {
  auth: { keyId: string; keySecret: string };
  paymentId: string;
  amountPaise: number;
  idempotencyKey: string;
}) {
  const req: RazorpayRequest = {
    method: "POST",
    path: `/payments/${encodeURIComponent(params.paymentId)}/refund`,
    auth: params.auth,
    refundIdempotencyKey: params.idempotencyKey,
    body: { amount: params.amountPaise },
  };
  const result = await transport(req);
  if (result.status >= 200 && result.status < 300) {
    return result.json as RazorpayRefund;
  }
  const retryable = result.status === 409 || result.retryable;
  throw new RazorpayApiError(
    errorMessageFromBody(result.json, `Razorpay request failed (${result.status || "network"})`),
    retryable ? "retryable" : "permanent",
    result.status,
  );
}

export function verifyRazorpayCheckoutSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
  secret: string;
}) {
  const expected = createHmac("sha256", params.secret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest("hex");
  if (expected.length !== params.signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(params.signature));
}

export function verifyRazorpayWebhookSignature(rawBody: string, signature: string, secret: string) {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

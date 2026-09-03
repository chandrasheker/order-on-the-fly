export const GATEWAY_ATTEMPT_STATUS = {
  CREATING: "CREATING",
  CREATED: "CREATED",
  PENDING: "PENDING",
  AUTHORIZED: "AUTHORIZED",
  CAPTURED: "CAPTURED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
  REFUND_PENDING: "REFUND_PENDING",
  REFUNDED: "REFUNDED",
} as const;

export const ACTIVE_GATEWAY_ATTEMPT_STATUSES = [
  GATEWAY_ATTEMPT_STATUS.CREATING,
  GATEWAY_ATTEMPT_STATUS.CREATED,
  GATEWAY_ATTEMPT_STATUS.PENDING,
  GATEWAY_ATTEMPT_STATUS.AUTHORIZED,
] as const;

export const GATEWAY_REFUND_STATUS = {
  PENDING: "PENDING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
} as const;

export const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";
export const RAZORPAY_CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";
export const RAZORPAY_PROVIDER = "razorpay";
export const GATEWAY_ATTEMPT_TTL_MS = 30 * 60 * 1000;

export function razorpayActiveAttemptKey(orderId: string, amountPaise: number) {
  return `rzp-active:${orderId}:${amountPaise}`;
}

export function gatewayCaptureIdempotencyKey(provider: string, providerPaymentId: string) {
  return `gateway:${provider}:${providerPaymentId}`;
}

export function lateCaptureRefundRequestKey(providerPaymentId: string) {
  const safe = providerPaymentId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40);
  return `tabletap-late-${safe}`;
}

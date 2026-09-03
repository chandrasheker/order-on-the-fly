import { prisma } from "@/lib/prisma";
import { fromPaise, toPaise } from "@/lib/money";
import { findActiveGatewayAttempt } from "@/lib/gateway-attempt-guard";
import { getOrderPaymentSummary, recordOrderPayment } from "@/lib/payment-allocation-service";
import { FINANCIAL_PAID_EPSILON, PAYMENT_STATUS } from "@/lib/order-financials";
import { isRazorpayAutomaticReady, readGatewayKeySecret, readWebhookSecret } from "@/lib/automatic-gateway";
import {
  ACTIVE_GATEWAY_ATTEMPT_STATUSES,
  GATEWAY_ATTEMPT_STATUS,
  GATEWAY_ATTEMPT_TTL_MS,
  GATEWAY_REFUND_STATUS,
  RAZORPAY_PROVIDER,
  gatewayCaptureIdempotencyKey,
  lateCaptureRefundRequestKey,
  razorpayActiveAttemptKey,
} from "@/lib/gateway-constants";
import { generatePublicToken } from "@/lib/public-token";
import {
  RazorpayApiError,
  normalizeRazorpayRefundIdempotencyKey,
  razorpayCreateOrder,
  razorpayCreateRefund,
  razorpayFetchOrder,
  razorpayFetchOrderByReceipt,
  razorpayFetchPayment,
  verifyRazorpayCheckoutSignature,
} from "@/lib/razorpay-client";
import { getBillForOrder, isUniqueConstraintError } from "@/lib/bill-service";
import { ensureBillPublicToken } from "@/lib/public-receipt-service";
import { logInfo, logWarn } from "@/lib/logger";

function customerStatus(status: string, paid: boolean) {
  if (paid || status === GATEWAY_ATTEMPT_STATUS.CAPTURED) return "Payment successful";
  if (status === GATEWAY_ATTEMPT_STATUS.CREATING) return "Preparing payment";
  if (status === GATEWAY_ATTEMPT_STATUS.CREATED || status === GATEWAY_ATTEMPT_STATUS.PENDING) {
    return "Waiting for payment";
  }
  if (status === GATEWAY_ATTEMPT_STATUS.AUTHORIZED) return "Verifying payment";
  if (status === GATEWAY_ATTEMPT_STATUS.FAILED) return "Payment failed";
  if (status === GATEWAY_ATTEMPT_STATUS.CANCELLED) return "Payment cancelled";
  if (status === GATEWAY_ATTEMPT_STATUS.EXPIRED) return "Payment expired";
  if (status === GATEWAY_ATTEMPT_STATUS.REFUND_PENDING || status === GATEWAY_ATTEMPT_STATUS.REFUNDED) {
    return "Still processing";
  }
  return "Still processing";
}

async function restaurantAuth(restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      id: true,
      name: true,
      tenantId: true,
      paymentGatewayProvider: true,
      paymentGatewayKeyId: true,
      paymentGatewaySecretEnc: true,
      paymentWebhookSecretEnc: true,
      paymentWebhookSecret: true,
    },
  });
  if (!restaurant || !isRazorpayAutomaticReady(restaurant) || !restaurant.paymentGatewayKeyId) {
    return null;
  }
  return {
    restaurant,
    auth: { keyId: restaurant.paymentGatewayKeyId, keySecret: readGatewayKeySecret(restaurant) },
    webhookSecret: readWebhookSecret(restaurant),
  };
}

function isReusableAttempt(attempt: { status: string; expiresAt: Date | null }) {
  if (!ACTIVE_GATEWAY_ATTEMPT_STATUSES.includes(attempt.status as (typeof ACTIVE_GATEWAY_ATTEMPT_STATUSES)[number])) {
    return false;
  }
  if (attempt.expiresAt && attempt.expiresAt.getTime() <= Date.now()) return false;
  return true;
}

function safeCheckout(params: {
  attempt: { publicToken: string; amountPaise: number; providerOrderId: string | null; status: string };
  keyId: string;
  name: string;
  receiptUrl?: string | null;
}) {
  return {
    publicToken: params.attempt.publicToken,
    provider: RAZORPAY_PROVIDER,
    keyId: params.keyId,
    orderId: params.attempt.providerOrderId,
    amountPaise: params.attempt.amountPaise,
    amount: fromPaise(params.attempt.amountPaise),
    currency: "INR",
    name: params.name,
    status: params.attempt.status,
    paid: params.attempt.status === GATEWAY_ATTEMPT_STATUS.CAPTURED,
    receiptUrl: params.receiptUrl ?? null,
  };
}

export async function createOrReuseRazorpayCheckout(params: {
  restaurantId: string;
  orderId: string;
  tableId: string;
}) {
  const configured = await restaurantAuth(params.restaurantId);
  if (!configured) {
    return { ok: false as const, error: "Automatic gateway is not configured", status: 409 };
  }

  const { getTableTabPaymentSummary } = await import("@/lib/table-tab-service");
  const tab = await getTableTabPaymentSummary(params.tableId);
  if (tab.unpaidOrderIds.length !== 1 || tab.unpaidOrderIds[0] !== params.orderId) {
    return {
      ok: false as const,
      error: "Please ask staff to settle the combined table bill.",
      status: 409,
    };
  }

  const order = await prisma.order.findFirst({
    where: { id: params.orderId, restaurantId: params.restaurantId, tableId: params.tableId },
    select: { id: true, status: true, tenantId: true, branchId: true },
  });
  if (!order) return { ok: false as const, error: "Order not found", status: 404 };
  if (order.status !== "SERVED") {
    return { ok: false as const, error: "Order must be fully served before payment", status: 400 };
  }

  const summary = await getOrderPaymentSummary(order.id);
  const amountPaise = toPaise(summary?.remaining ?? 0);
  if (!summary || amountPaise <= 0) {
    return { ok: false as const, error: "Nothing to pay", status: 400 };
  }

  const idempotencyKey = razorpayActiveAttemptKey(order.id, amountPaise);
  const existing = await prisma.gatewayPaymentAttempt.findUnique({
    where: { restaurantId_idempotencyKey: { restaurantId: params.restaurantId, idempotencyKey } },
  });
  if (existing) {
    const reusable = isReusableAttempt(existing);
    if (reusable) {
      if (!existing.providerOrderId) {
        const recovered = await recoverRazorpayOrder(configured.auth, existing, {
          keyId: configured.auth.keyId,
          name: configured.restaurant.name,
        });
        if (!recovered.ok) return recovered;
      }
      const pending = await prisma.gatewayPaymentAttempt.update({
        where: { id: existing.id },
        data: { status: GATEWAY_ATTEMPT_STATUS.PENDING },
      });
      return {
        ok: true as const,
        checkout: safeCheckout({
          attempt: pending,
          keyId: configured.auth.keyId,
          name: configured.restaurant.name,
        }),
        reused: true,
      };
    }
    await prisma.gatewayPaymentAttempt.update({
      where: { id: existing.id },
      data: {
        idempotencyKey: `rzp-closed:${existing.id}`,
        status:
          existing.expiresAt && existing.expiresAt.getTime() <= Date.now()
            ? GATEWAY_ATTEMPT_STATUS.EXPIRED
            : existing.status,
      },
    });
  }

  const otherActive = await findActiveGatewayAttempt(order.id);
  if (otherActive && otherActive.idempotencyKey !== idempotencyKey) {
    return {
      ok: false as const,
      error: "Payment is being verified. Please don't pay again yet.",
      status: 409,
    };
  }

  const publicToken = generatePublicToken();
  let attempt;
  try {
    attempt = await prisma.gatewayPaymentAttempt.create({
      data: {
        publicToken,
        tenantId: order.tenantId ?? configured.restaurant.tenantId,
        restaurantId: params.restaurantId,
        branchId: order.branchId,
        tableId: params.tableId,
        orderId: order.id,
        provider: RAZORPAY_PROVIDER,
        amountPaise,
        currency: "INR",
        status: GATEWAY_ATTEMPT_STATUS.CREATING,
        idempotencyKey,
        providerReceipt: `g${publicToken.slice(0, 24)}`,
        expiresAt: new Date(Date.now() + GATEWAY_ATTEMPT_TTL_MS),
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const raced = await prisma.gatewayPaymentAttempt.findUnique({
      where: { restaurantId_idempotencyKey: { restaurantId: params.restaurantId, idempotencyKey } },
    });
    if (raced && isReusableAttempt(raced)) {
      return {
        ok: true as const,
        checkout: safeCheckout({
          attempt: raced,
          keyId: configured.auth.keyId,
          name: configured.restaurant.name,
        }),
        reused: true,
      };
    }
    return { ok: false as const, error: "Payment is being verified. Please don't pay again yet.", status: 409 };
  }

  try {
    const created = await razorpayCreateOrder({
      auth: configured.auth,
      amountPaise,
      receipt: attempt.providerReceipt ?? `g${attempt.id}`,
      notes: {
        restaurantId: params.restaurantId,
        orderId: order.id,
        attemptId: attempt.id,
      },
    });
    if (created.amount !== amountPaise || created.currency !== "INR") {
      await prisma.gatewayPaymentAttempt.update({
        where: { id: attempt.id },
        data: { status: GATEWAY_ATTEMPT_STATUS.FAILED, failureMessage: "Provider amount mismatch" },
      });
      return { ok: false as const, error: "Payment could not be completed. You can retry.", status: 409 };
    }
    const updated = await prisma.gatewayPaymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: GATEWAY_ATTEMPT_STATUS.PENDING,
        providerOrderId: created.id,
      },
    });
    return {
      ok: true as const,
      checkout: safeCheckout({
        attempt: updated,
        keyId: configured.auth.keyId,
        name: configured.restaurant.name,
      }),
      reused: false,
    };
  } catch (error) {
    if (error instanceof RazorpayApiError && error.kind === "retryable") {
      const recovered = await recoverRazorpayOrder(configured.auth, attempt, {
        keyId: configured.auth.keyId,
        name: configured.restaurant.name,
      });
      if (recovered.ok) return recovered;
      return {
        ok: false as const,
        error: "Payment is being verified. Please don't pay again yet.",
        status: 503,
        retryable: true as const,
      };
    }
    await prisma.gatewayPaymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: GATEWAY_ATTEMPT_STATUS.FAILED,
        failureMessage: error instanceof Error ? error.message : "Provider error",
      },
    });
    return { ok: false as const, error: "Payment could not be completed. You can retry.", status: 502 };
  }
}

async function recoverRazorpayOrder(
  auth: { keyId: string; keySecret: string },
  attempt: { id: string; publicToken: string; amountPaise: number; providerReceipt: string | null; providerOrderId: string | null; status: string },
  display: { keyId: string; name: string },
) {
  try {
    const found = attempt.providerOrderId
      ? await razorpayFetchOrder(auth, attempt.providerOrderId)
      : await razorpayFetchOrderByReceipt(auth, attempt.providerReceipt ?? `g${attempt.id}`);
    if (!found) {
      return { ok: false as const, error: "Payment is being verified. Please don't pay again yet.", status: 503 };
    }
    const updated = await prisma.gatewayPaymentAttempt.update({
      where: { id: attempt.id },
      data: {
        providerOrderId: found.id,
        status: GATEWAY_ATTEMPT_STATUS.PENDING,
      },
    });
    return {
      ok: true as const,
      checkout: safeCheckout({
        attempt: updated,
        keyId: display.keyId,
        name: display.name,
      }),
      reused: true,
    };
  } catch (error) {
    if (error instanceof RazorpayApiError && error.kind === "retryable") {
      return { ok: false as const, error: "Payment is being verified. Please don't pay again yet.", status: 503 };
    }
    return { ok: false as const, error: "Payment could not be completed. You can retry.", status: 502 };
  }
}

function publicAttemptVisible(
  attempt: { restaurantId: string },
  restaurantId?: string | null,
  requireRestaurant?: boolean,
) {
  if (requireRestaurant && !restaurantId) return false;
  if (restaurantId && attempt.restaurantId !== restaurantId) return false;
  return true;
}

export async function cancelGatewayAttempt(params: {
  publicToken: string;
  restaurantId?: string | null;
  requireRestaurant?: boolean;
}) {
  const attempt = await prisma.gatewayPaymentAttempt.findUnique({ where: { publicToken: params.publicToken } });
  if (!attempt || !publicAttemptVisible(attempt, params.restaurantId, params.requireRestaurant)) {
    return { ok: false as const, error: "Not found", status: 404 };
  }
  if (attempt.status === GATEWAY_ATTEMPT_STATUS.CAPTURED) {
    return { ok: true as const, status: attempt.status };
  }
  if (ACTIVE_GATEWAY_ATTEMPT_STATUSES.includes(attempt.status as (typeof ACTIVE_GATEWAY_ATTEMPT_STATUSES)[number])) {
    await prisma.gatewayPaymentAttempt.update({
      where: { id: attempt.id },
      data: { status: GATEWAY_ATTEMPT_STATUS.CANCELLED },
    });
  }
  return { ok: true as const, status: GATEWAY_ATTEMPT_STATUS.CANCELLED };
}

export async function getGatewayAttemptPublicStatus(
  publicToken: string,
  restaurantId?: string | null,
  requireRestaurant?: boolean,
) {
  const attempt = await prisma.gatewayPaymentAttempt.findUnique({ where: { publicToken } });
  if (!attempt || !publicAttemptVisible(attempt, restaurantId, requireRestaurant)) {
    return null;
  }
  const summary = await getOrderPaymentSummary(attempt.orderId);
  const paid = Boolean(summary?.fullyPaid) || attempt.status === GATEWAY_ATTEMPT_STATUS.CAPTURED;
  let receiptUrl: string | null = null;
  if (paid) {
    const bill = await getBillForOrder(attempt.orderId, attempt.restaurantId);
    if (bill && bill.status !== "VOIDED") {
      const token = await ensureBillPublicToken(bill.id);
      receiptUrl = token ? `/receipt/${token}` : null;
    }
  }
  return {
    publicToken: attempt.publicToken,
    amountPaise: attempt.amountPaise,
    amount: fromPaise(attempt.amountPaise),
    currency: attempt.currency,
    status: attempt.status,
    paid,
    retryable: [GATEWAY_ATTEMPT_STATUS.FAILED, GATEWAY_ATTEMPT_STATUS.CANCELLED, GATEWAY_ATTEMPT_STATUS.EXPIRED].includes(
      attempt.status as "FAILED" | "CANCELLED" | "EXPIRED",
    ),
    message: customerStatus(attempt.status, paid),
    receiptUrl,
  };
}

export async function settleRazorpayCapture(params: {
  restaurantId: string;
  attemptId?: string;
  providerOrderId?: string;
  providerPaymentId: string;
  amountPaise: number;
  currency?: string;
}) {
  const configured = await restaurantAuth(params.restaurantId);
  if (!configured) return { ok: false as const, error: "Automatic gateway is not configured", status: 409 };

  const attempt = params.attemptId
    ? await prisma.gatewayPaymentAttempt.findFirst({
        where: { id: params.attemptId, restaurantId: params.restaurantId },
      })
    : await prisma.gatewayPaymentAttempt.findFirst({
        where: {
          restaurantId: params.restaurantId,
          provider: RAZORPAY_PROVIDER,
          providerOrderId: params.providerOrderId,
        },
      });
  if (!attempt) return { ok: false as const, error: "Gateway attempt not found", status: 404 };
  if (attempt.restaurantId !== params.restaurantId) {
    return { ok: false as const, error: "Gateway attempt restaurant mismatch", status: 409 };
  }
  if ((params.currency ?? "INR") !== "INR" || attempt.currency !== "INR") {
    return { ok: false as const, error: "Wrong currency", status: 409 };
  }
  if (params.amountPaise !== attempt.amountPaise) {
    return { ok: false as const, error: "Wrong amount", status: 409 };
  }
  if (params.providerOrderId && attempt.providerOrderId && params.providerOrderId !== attempt.providerOrderId) {
    return { ok: false as const, error: "Wrong provider order", status: 409 };
  }

  let providerPayment;
  try {
    providerPayment = await razorpayFetchPayment(configured.auth, params.providerPaymentId);
  } catch (error) {
    if (error instanceof RazorpayApiError && error.kind === "retryable") {
      return { ok: false as const, error: "Payment is being verified. Please don't pay again yet.", status: 503 };
    }
    return { ok: false as const, error: "Payment could not be completed. You can retry.", status: 502 };
  }
  if (providerPayment.status !== "captured") {
    return { ok: false as const, error: "Provider payment is not captured", status: 409, pending: true as const };
  }
  if (providerPayment.order_id !== attempt.providerOrderId) {
    return { ok: false as const, error: "Wrong provider order association", status: 409 };
  }
  if (providerPayment.amount !== attempt.amountPaise || providerPayment.currency !== "INR") {
    return { ok: false as const, error: "Wrong amount", status: 409 };
  }

  const order = await prisma.order.findFirst({
    where: { id: attempt.orderId, restaurantId: params.restaurantId },
  });
  if (!order) return { ok: false as const, error: "Order not found", status: 404 };

  const existingByProvider = await prisma.payment.findFirst({
    where: {
      restaurantId: params.restaurantId,
      provider: RAZORPAY_PROVIDER,
      providerPaymentId: params.providerPaymentId,
    },
  });
  if (existingByProvider) {
    if (existingByProvider.orderId !== attempt.orderId) {
      return {
        ok: false as const,
        error: "Provider payment is already attached to another order",
        status: 409,
      };
    }
    return markSameProviderPaymentCaptured({
      attempt,
      payment: existingByProvider,
      providerPaymentId: params.providerPaymentId,
    });
  }

  const summary = await getOrderPaymentSummary(order.id);
  const orderAlreadySettled = Boolean(
    summary && summary.remaining <= FINANCIAL_PAID_EPSILON && order.paidAt,
  );
  if (orderAlreadySettled) {
    return refundLateCompetingCapture({
      attempt,
      restaurantId: params.restaurantId,
      providerPaymentId: params.providerPaymentId,
    });
  }

  const recorded = await recordOrderPayment({
    orderId: order.id,
    amount: fromPaise(attempt.amountPaise),
    method: "UPI",
    provider: RAZORPAY_PROVIDER,
    providerPaymentId: params.providerPaymentId,
    idempotencyKey: gatewayCaptureIdempotencyKey(RAZORPAY_PROVIDER, params.providerPaymentId),
    capture: true,
    status: PAYMENT_STATUS.CAPTURED,
    note: "Razorpay automatic capture",
    collectedByName: "Razorpay",
  });
  if (!recorded.ok) {
    return { ok: false as const, error: recorded.error, status: recorded.status };
  }

  const recordedPayment =
    recorded.payment && recorded.payment.providerPaymentId === params.providerPaymentId
      ? recorded.payment
      : await prisma.payment.findFirst({
          where: {
            restaurantId: params.restaurantId,
            provider: RAZORPAY_PROVIDER,
            providerPaymentId: params.providerPaymentId,
          },
        });
  if (recordedPayment) {
    if (recordedPayment.orderId !== attempt.orderId) {
      return {
        ok: false as const,
        error: "Provider payment is already attached to another order",
        status: 409,
      };
    }
    return markSameProviderPaymentCaptured({
      attempt,
      payment: recordedPayment,
      providerPaymentId: params.providerPaymentId,
    });
  }

  return refundLateCompetingCapture({
    attempt,
    restaurantId: params.restaurantId,
    providerPaymentId: params.providerPaymentId,
  });
}

async function markSameProviderPaymentCaptured(params: {
  attempt: {
    id: string;
    billId: string | null;
    capturedAt: Date | null;
    verifiedAt: Date | null;
  };
  payment: { id: string; billId: string | null };
  providerPaymentId: string;
}) {
  const bill = params.payment.billId
    ? await prisma.bill.findUnique({ where: { id: params.payment.billId } })
    : null;
  if (bill) await ensureBillPublicToken(bill.id);

  await prisma.gatewayPaymentAttempt.update({
    where: { id: params.attempt.id },
    data: {
      status: GATEWAY_ATTEMPT_STATUS.CAPTURED,
      providerPaymentId: params.providerPaymentId,
      billId: bill?.id ?? params.attempt.billId,
      capturedAt: params.attempt.capturedAt ?? new Date(),
      verifiedAt: params.attempt.verifiedAt ?? new Date(),
    },
  });

  return {
    ok: true as const,
    payment: params.payment,
    attemptId: params.attempt.id,
    billId: bill?.id ?? params.attempt.billId,
  };
}

async function refundLateCompetingCapture(params: {
  attempt: { id: string; amountPaise: number };
  restaurantId: string;
  providerPaymentId: string;
}) {
  const lateRefund = await refundCapturedProviderPayment({
    restaurantId: params.restaurantId,
    providerPaymentId: params.providerPaymentId,
    amountPaise: params.attempt.amountPaise,
    reason: "late_duplicate_capture",
  });
  if (lateRefund.refunded) {
    await prisma.gatewayPaymentAttempt.update({
      where: { id: params.attempt.id },
      data: {
        status: GATEWAY_ATTEMPT_STATUS.REFUNDED,
        providerPaymentId: params.providerPaymentId,
        failureMessage: "Late competing capture refunded",
      },
    });
    return { ok: false as const, error: "Order already paid; provider capture was refunded", status: 409 };
  }
  if (lateRefund.pending) {
    await prisma.gatewayPaymentAttempt.update({
      where: { id: params.attempt.id },
      data: {
        status: GATEWAY_ATTEMPT_STATUS.REFUND_PENDING,
        providerPaymentId: params.providerPaymentId,
        failureMessage: lateRefund.error,
      },
    });
    return {
      ok: false as const,
      error: "Order already paid; provider refund is still processing",
      status: 409,
    };
  }
  await prisma.gatewayPaymentAttempt.update({
    where: { id: params.attempt.id },
    data: {
      status: GATEWAY_ATTEMPT_STATUS.REFUND_PENDING,
      providerPaymentId: params.providerPaymentId,
      failureMessage: lateRefund.error,
    },
  });
  return {
    ok: false as const,
    error: "Order already paid; provider refund could not be completed",
    status: 409,
  };
}

export async function verifyRazorpayCheckoutCallback(params: {
  publicToken: string;
  restaurantId?: string | null;
  requireRestaurant?: boolean;
  razorpayPaymentId: string;
  razorpaySignature: string;
}) {
  const attempt = await prisma.gatewayPaymentAttempt.findUnique({
    where: { publicToken: params.publicToken },
  });
  if (!attempt || !publicAttemptVisible(attempt, params.restaurantId, params.requireRestaurant)) {
    return { ok: false as const, error: "Not found", status: 404 };
  }
  const configured = await restaurantAuth(attempt.restaurantId);
  if (!configured) return { ok: false as const, error: "Automatic gateway is not configured", status: 409 };
  if (!attempt.providerOrderId) {
    return { ok: false as const, error: "Payment is being verified. Please don't pay again yet.", status: 409 };
  }
  const valid = verifyRazorpayCheckoutSignature({
    orderId: attempt.providerOrderId,
    paymentId: params.razorpayPaymentId,
    signature: params.razorpaySignature,
    secret: configured.auth.keySecret,
  });
  if (!valid) {
    logWarn("payments:gateway", "Checkout signature rejected", {
      restaurantId: attempt.restaurantId,
      attemptId: attempt.id,
    });
    return { ok: false as const, error: "Invalid payment signature", status: 401 };
  }
  await prisma.gatewayPaymentAttempt.update({
    where: { id: attempt.id },
    data: { status: GATEWAY_ATTEMPT_STATUS.AUTHORIZED, verifiedAt: new Date() },
  });
  return settleRazorpayCapture({
    restaurantId: attempt.restaurantId,
    attemptId: attempt.id,
    providerOrderId: attempt.providerOrderId,
    providerPaymentId: params.razorpayPaymentId,
    amountPaise: attempt.amountPaise,
    currency: "INR",
  });
}

function resolveRefundRequestKey(raw?: string | null) {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) {
    return { ok: false as const, error: "Refund request id is required", status: 400 };
  }
  const normalized = normalizeRazorpayRefundIdempotencyKey(trimmed);
  if (!normalized) {
    return { ok: false as const, error: "Invalid refund request id", status: 400 };
  }
  return { ok: true as const, key: normalized };
}

function providerRefundCompleted(status: string) {
  return status === "processed" || status === "completed";
}

export async function refundAutomaticPayment(params: {
  paymentId: string;
  restaurantId: string;
  amount?: number;
  requestId?: string;
  idempotencyKey?: string;
  actorUserId?: string;
  actorName?: string;
}) {
  const payment = await prisma.payment.findFirst({
    where: { id: params.paymentId, restaurantId: params.restaurantId },
  });
  if (!payment) return { ok: false as const, error: "Payment not found", status: 404 };
  if (payment.provider !== RAZORPAY_PROVIDER || !payment.providerPaymentId) {
    const { refundCapturedPayment } = await import("@/lib/payment-allocation-service");
    return refundCapturedPayment(params);
  }

  const resolvedKey = resolveRefundRequestKey(params.requestId ?? params.idempotencyKey);
  if (!resolvedKey.ok) return resolvedKey;
  const idempotencyKey = resolvedKey.key;

  const amountPaise = params.amount == null ? toPaise(payment.amount) : toPaise(params.amount);
  const existing = await prisma.gatewayRefundAttempt.findUnique({
    where: { restaurantId_idempotencyKey: { restaurantId: params.restaurantId, idempotencyKey } },
  });
  if (existing && existing.paymentId !== payment.id) {
    return { ok: false as const, error: "Refund request id already used", status: 409 };
  }
  if (existing && existing.amountPaise !== amountPaise) {
    return { ok: false as const, error: "Refund request id already used for a different amount", status: 409 };
  }
  if (existing?.status === GATEWAY_REFUND_STATUS.SUCCEEDED) {
    const { refundCapturedPayment } = await import("@/lib/payment-allocation-service");
    return refundCapturedPayment({
      ...params,
      amount: fromPaise(existing.amountPaise),
      idempotencyKey,
      provider: RAZORPAY_PROVIDER,
      providerPaymentId: existing.providerRefundId ?? undefined,
    });
  }

  const prior = await prisma.payment.findMany({
    where: { restaurantId: params.restaurantId, refundOfPaymentId: payment.id },
  });
  const already = prior.reduce((sum, row) => sum + toPaise(row.amount), 0);
  if (already + amountPaise > toPaise(payment.amount)) {
    return { ok: false as const, error: "Refund exceeds captured amount", status: 400 };
  }

  let refundAttempt = existing;
  if (!refundAttempt) {
    try {
      refundAttempt = await prisma.gatewayRefundAttempt.create({
        data: {
          restaurantId: params.restaurantId,
          paymentId: payment.id,
          amountPaise,
          status: GATEWAY_REFUND_STATUS.PENDING,
          idempotencyKey,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      refundAttempt = await prisma.gatewayRefundAttempt.findUnique({
        where: { restaurantId_idempotencyKey: { restaurantId: params.restaurantId, idempotencyKey } },
      });
      if (!refundAttempt) throw error;
    }
  }

  const configured = await restaurantAuth(params.restaurantId);
  if (!configured) return { ok: false as const, error: "Automatic gateway is not configured", status: 409 };

  try {
    const refund = await razorpayCreateRefund({
      auth: configured.auth,
      paymentId: payment.providerPaymentId,
      amountPaise,
      idempotencyKey,
    });
    if (refund.status === "pending") {
      await prisma.gatewayRefundAttempt.update({
        where: { id: refundAttempt.id },
        data: { status: GATEWAY_REFUND_STATUS.PENDING, providerRefundId: refund.id },
      });
      return {
        ok: false as const,
        error: "Refund is still processing at the provider",
        status: 409,
        pending: true as const,
      };
    }
    if (refund.status === "failed" || !providerRefundCompleted(refund.status)) {
      await prisma.gatewayRefundAttempt.update({
        where: { id: refundAttempt.id },
        data: {
          status: GATEWAY_REFUND_STATUS.FAILED,
          failureMessage: "Provider refund failed",
          providerRefundId: refund.id,
        },
      });
      return { ok: false as const, error: "Provider refund failed", status: 502 };
    }
    await prisma.gatewayRefundAttempt.update({
      where: { id: refundAttempt.id },
      data: { status: GATEWAY_REFUND_STATUS.SUCCEEDED, providerRefundId: refund.id },
    });
    const { refundCapturedPayment } = await import("@/lib/payment-allocation-service");
    return refundCapturedPayment({
      ...params,
      amount: fromPaise(amountPaise),
      idempotencyKey,
      provider: RAZORPAY_PROVIDER,
      providerPaymentId: refund.id,
    });
  } catch (error) {
    if (error instanceof RazorpayApiError && error.kind === "retryable") {
      await prisma.gatewayRefundAttempt.update({
        where: { id: refundAttempt.id },
        data: {
          status: GATEWAY_REFUND_STATUS.PENDING,
          failureMessage: error.message,
        },
      });
      return {
        ok: false as const,
        error: "Refund could not be completed. Retry with the same request.",
        status: 503,
        pending: true as const,
      };
    }
    await prisma.gatewayRefundAttempt.update({
      where: { id: refundAttempt.id },
      data: {
        status: GATEWAY_REFUND_STATUS.FAILED,
        failureMessage: error instanceof Error ? error.message : "Provider refund failed",
      },
    });
    return { ok: false as const, error: "Provider refund failed", status: 502 };
  }
}

async function refundCapturedProviderPayment(params: {
  restaurantId: string;
  providerPaymentId: string;
  amountPaise: number;
  reason: string;
}) {
  const configured = await restaurantAuth(params.restaurantId);
  if (!configured) {
    return { ok: false as const, refunded: false as const, error: "Automatic gateway is not configured" };
  }
  const idempotencyKey = lateCaptureRefundRequestKey(params.providerPaymentId);
  try {
    const refund = await razorpayCreateRefund({
      auth: configured.auth,
      paymentId: params.providerPaymentId,
      amountPaise: params.amountPaise,
      idempotencyKey,
    });
    if (providerRefundCompleted(refund.status)) {
      logInfo("payments:gateway", "Late provider capture refunded", {
        restaurantId: params.restaurantId,
        providerPaymentId: params.providerPaymentId,
        reason: params.reason,
      });
      return { ok: true as const, refunded: true as const };
    }
    if (refund.status === "pending") {
      return {
        ok: false as const,
        refunded: false as const,
        pending: true as const,
        error: "Provider refund is still processing",
      };
    }
    return { ok: false as const, refunded: false as const, error: "Provider refund failed" };
  } catch (error) {
    const retryable = error instanceof RazorpayApiError && error.kind === "retryable";
    logWarn("payments:gateway", "Late provider refund failed", {
      restaurantId: params.restaurantId,
      message: error instanceof Error ? error.message : "unknown",
    });
    return {
      ok: false as const,
      refunded: false as const,
      pending: retryable || undefined,
      error: error instanceof Error ? error.message : "refund failed",
    };
  }
}

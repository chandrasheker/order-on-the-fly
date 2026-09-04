import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { encryptSecret } from "@/lib/credential-crypto";
import { dispatchRealtimeNotifications } from "@/lib/outbound-notification-service";
import { getAppBaseUrl } from "@/lib/server-app-url";
import { todayDateString, formatCurrency } from "@/lib/utils";
import { getOrderPaymentSummary, recordOrderPayment } from "@/lib/payment-allocation-service";
import { getPaymentProvider } from "@/lib/payment-providers";
import { FINANCIAL_PAID_EPSILON, PAYMENT_STATUS } from "@/lib/order-financials";
import { isUniqueConstraintError } from "@/lib/bill-service";
import { logInfo, logWarn } from "@/lib/logger";
import type { PaymentGatewayProvider } from "@/generated/prisma/client";
import { isRazorpayAutomaticReady, readWebhookSecret } from "@/lib/automatic-gateway";
import { RAZORPAY_PROVIDER } from "@/lib/gateway-constants";
import { settleRazorpayCapture } from "@/lib/gateway-payment-service";
import { AUDIT_ACTION, AUDIT_ACTOR_TYPE, AUDIT_CATEGORY, AUDIT_EVENT_KIND, AUDIT_SEVERITY, AUDIT_SOURCE } from "@/platform/forensics/constants";
import { appendPlatformAuditEventInTx, tryAppendPlatformAuditEvent } from "@/platform/forensics/platform-audit-service";
import { auditGatewaySettingsSnapshot } from "@/platform/forensics/snapshots";
import { setForensicActor, setForensicCorrelationId, setForensicTenant } from "@/platform/forensics/request-context";

function publicGatewaySettings(row: {
  paymentGatewayProvider: PaymentGatewayProvider | null;
  paymentGatewayKeyId: string | null;
  paymentGatewaySecretEnc?: string | null;
  paymentWebhookSecret?: string | null;
  paymentWebhookSecretEnc?: string | null;
  slug: string;
}) {
  return {
    provider: row.paymentGatewayProvider,
    keyId: row.paymentGatewayKeyId,
    configured: isRazorpayAutomaticReady(row),
    webhookConfigured: Boolean(readWebhookSecret(row)),
    webhookUrl: `${getAppBaseUrl()}/api/webhooks/payment/${row.slug}`,
    automaticAvailable: isRazorpayAutomaticReady(row),
  };
}

export async function getPaymentGatewaySettings(restaurantId: string) {
  const row = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      paymentGatewayProvider: true,
      paymentGatewayKeyId: true,
      paymentGatewaySecretEnc: true,
      paymentWebhookSecret: true,
      paymentWebhookSecretEnc: true,
      slug: true,
    },
  });
  if (!row) return null;
  return publicGatewaySettings(row);
}

export async function updatePaymentGatewaySettings(
  restaurantId: string,
  data: {
    provider?: PaymentGatewayProvider | null;
    keyId?: string | null;
    secret?: string | null;
    webhookSecret?: string | null;
  },
) {
  if (!(await isFeatureEnabled(restaurantId, "payment_webhooks"))) {
    throw new Error("Payment webhooks not enabled");
  }

  const update: Record<string, unknown> = {};
  if (data.provider !== undefined) update.paymentGatewayProvider = data.provider;
  if (typeof data.keyId === "string") update.paymentGatewayKeyId = data.keyId.trim() || null;
  if (typeof data.webhookSecret === "string" && data.webhookSecret.trim()) {
    update.paymentWebhookSecretEnc = encryptSecret(data.webhookSecret.trim());
    update.paymentWebhookSecret = null;
  }
  if (typeof data.secret === "string" && data.secret.trim()) {
    update.paymentGatewaySecretEnc = encryptSecret(data.secret.trim());
  }

  const beforeRow = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      paymentGatewayProvider: true,
      paymentGatewayKeyId: true,
      paymentGatewaySecretEnc: true,
      paymentWebhookSecret: true,
      paymentWebhookSecretEnc: true,
      tenantId: true,
    },
  });
  await prisma.$transaction(async (tx) => {
    await tx.restaurant.update({
      where: { id: restaurantId },
      data: update,
    });
    const secretChanged = Boolean(update.paymentGatewaySecretEnc);
    const webhookSecretChanged = Boolean(update.paymentWebhookSecretEnc);
    const providerChanged =
      data.provider !== undefined && data.provider !== beforeRow?.paymentGatewayProvider;
    await appendPlatformAuditEventInTx(tx, {
      category: AUDIT_CATEGORY.CONFIG,
      action: secretChanged
        ? AUDIT_ACTION.GATEWAY_CREDENTIAL_ROTATED
        : webhookSecretChanged
          ? AUDIT_ACTION.GATEWAY_WEBHOOK_SECRET_ROTATED
          : providerChanged
            ? AUDIT_ACTION.GATEWAY_PROVIDER_CHANGED
            : AUDIT_ACTION.GATEWAY_CONFIGURATION_CHANGED,
      restaurantId,
      tenantId: beforeRow?.tenantId,
      resourceType: "Restaurant",
      resourceId: restaurantId,
      before: auditGatewaySettingsSnapshot({
        provider: beforeRow?.paymentGatewayProvider,
        keyId: beforeRow?.paymentGatewayKeyId,
        secretPresent: Boolean(beforeRow?.paymentGatewaySecretEnc),
        webhookSecretPresent: Boolean(readWebhookSecret(beforeRow ?? {})),
      }),
      after: auditGatewaySettingsSnapshot({
        provider: (update.paymentGatewayProvider as string | undefined) ?? beforeRow?.paymentGatewayProvider,
        keyId: (update.paymentGatewayKeyId as string | null | undefined) ?? beforeRow?.paymentGatewayKeyId,
        secretPresent: secretChanged || Boolean(beforeRow?.paymentGatewaySecretEnc),
        webhookSecretPresent: webhookSecretChanged || Boolean(readWebhookSecret(beforeRow ?? {})),
      }),
      metadata: {
        gatewaySecretChanged: secretChanged,
        webhookSecretChanged,
      },
    });
  });
  return getPaymentGatewaySettings(restaurantId);
}

export async function processPaymentWebhook(params: {
  slug: string;
  provider: string;
  rawBody: string;
  headers: Headers;
}) {
  const restaurant = await prisma.restaurant.findUnique({ where: { slug: params.slug } });
  if (!restaurant) return { ok: false as const, status: 404, error: "Restaurant not found" };
  setForensicActor({ type: AUDIT_ACTOR_TYPE.PAYMENT_PROVIDER, id: params.provider, name: params.provider });
  setForensicTenant({ tenantId: restaurant.tenantId, restaurantId: restaurant.id });
  void tryAppendPlatformAuditEvent({
    eventKind: AUDIT_EVENT_KIND.ACTION,
    source: AUDIT_SOURCE.WEBHOOK,
    category: AUDIT_CATEGORY.MONEY,
    action: AUDIT_ACTION.RAZORPAY_WEBHOOK_RECEIVED,
    actorType: AUDIT_ACTOR_TYPE.PAYMENT_PROVIDER,
    actorId: params.provider,
    restaurantId: restaurant.id,
    tenantId: restaurant.tenantId,
  });

  if (!(await isFeatureEnabled(restaurant.id, "payment_webhooks"))) {
    return { ok: false as const, status: 403, error: "Payment webhooks disabled" };
  }

  const expectedProvider = restaurant.paymentGatewayProvider?.toLowerCase();
  if (expectedProvider && expectedProvider !== params.provider.toLowerCase()) {
    logWarn("payments:webhook", "Provider mismatch", {
      restaurantId: restaurant.id,
      expectedProvider,
      provider: params.provider,
    });
    return { ok: false as const, status: 401, error: "Invalid provider" };
  }

  const providerName = params.provider.toLowerCase();
  if (providerName === "phonepe" || providerName === "paytm") {
    return {
      ok: false as const,
      status: 409,
      error: "Automatic gateway not available for this provider yet",
    };
  }

  const webhookSecret = readWebhookSecret(restaurant);
  if (!webhookSecret) {
    return { ok: false as const, status: 400, error: "Webhook secret not configured" };
  }

  const adapter = getPaymentProvider(params.provider);
  if (!adapter) {
    return { ok: false as const, status: 400, error: "Unsupported provider" };
  }
  const verified = adapter.verifyWebhook(params.rawBody, params.headers, webhookSecret);
  if (!verified.ok) {
    logWarn("payments:webhook", "Signature rejected", {
      restaurantId: restaurant.id,
      provider: params.provider,
    });
    void tryAppendPlatformAuditEvent({
      eventKind: AUDIT_EVENT_KIND.SECURITY,
      severity: AUDIT_SEVERITY.WARN,
      source: AUDIT_SOURCE.WEBHOOK,
      category: AUDIT_CATEGORY.SECURITY,
      action: AUDIT_ACTION.RAZORPAY_SIGNATURE_INVALID,
      outcome: "DENIED",
      actorType: AUDIT_ACTOR_TYPE.PAYMENT_PROVIDER,
      actorId: params.provider,
      restaurantId: restaurant.id,
    });
    void tryAppendPlatformAuditEvent({
      source: AUDIT_SOURCE.WEBHOOK,
      category: AUDIT_CATEGORY.MONEY,
      action: AUDIT_ACTION.RAZORPAY_WEBHOOK_REJECTED,
      outcome: "DENIED",
      actorType: AUDIT_ACTOR_TYPE.PAYMENT_PROVIDER,
      actorId: params.provider,
      restaurantId: restaurant.id,
    });
    return { ok: false as const, status: 401, error: verified.error ?? "Invalid signature" };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(params.rawBody) as Record<string, unknown>;
  } catch {
    return { ok: false as const, status: 400, error: "Invalid JSON" };
  }

  const parsed = parseWebhookPayload(params.provider, payload);
  if (!parsed) {
    return { ok: true as const, status: 200, message: "Ignored event" };
  }

  const eventIdentity = {
    restaurantId_provider_externalId: {
      restaurantId: restaurant.id,
      provider: params.provider,
      externalId: parsed.externalId,
    },
  };
  const existing = await prisma.paymentWebhookEvent.findUnique({
    where: eventIdentity,
  });
  if (existing && existing.restaurantId !== restaurant.id) {
    logWarn("payments:webhook", "Refusing cross-restaurant webhook event", {
      restaurantId: restaurant.id,
      eventRestaurantId: existing.restaurantId,
      provider: params.provider,
      externalId: parsed.externalId,
    });
    return { ok: false as const, status: 409, error: "Webhook event restaurant mismatch" };
  }
  if (existing?.processedAt) {
    setForensicCorrelationId(existing.externalId);
    void tryAppendPlatformAuditEvent({
      source: AUDIT_SOURCE.WEBHOOK,
      category: AUDIT_CATEGORY.MONEY,
      action: AUDIT_ACTION.RAZORPAY_WEBHOOK_REPLAYED,
      actorType: AUDIT_ACTOR_TYPE.PAYMENT_PROVIDER,
      actorId: params.provider,
      restaurantId: restaurant.id,
      correlationId: existing.externalId,
      metadata: { providerEventId: existing.externalId, orderId: existing.orderId },
    });
    return { ok: true as const, status: 200, message: "Already processed" };
  }

  let event = existing;
  if (!event) {
    try {
      event = await prisma.paymentWebhookEvent.create({
        data: {
          restaurantId: restaurant.id,
          provider: params.provider,
          externalId: parsed.externalId,
          amount: parsed.amount,
          tableId: parsed.tableId,
          orderId: parsed.orderId,
          payload: params.rawBody,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      event = await prisma.paymentWebhookEvent.findUnique({
        where: eventIdentity,
      });
      if (!event) throw error;
      if (event.restaurantId !== restaurant.id) {
        return { ok: false as const, status: 409, error: "Webhook event restaurant mismatch" };
      }
      if (event.processedAt) {
        void tryAppendPlatformAuditEvent({
          source: AUDIT_SOURCE.WEBHOOK,
          category: AUDIT_CATEGORY.MONEY,
          action: AUDIT_ACTION.RAZORPAY_WEBHOOK_REPLAYED,
          actorType: AUDIT_ACTOR_TYPE.PAYMENT_PROVIDER,
          actorId: params.provider,
          restaurantId: restaurant.id,
          correlationId: event.externalId,
          metadata: { providerEventId: event.externalId },
        });
        return { ok: true as const, status: 200, message: "Already processed" };
      }
    }
  }

  logInfo("payments:webhook", "Webhook accepted", {
    restaurantId: restaurant.id,
    provider: params.provider,
    externalId: parsed.externalId,
    amount: parsed.amount,
    orderId: parsed.orderId,
  });
  setForensicCorrelationId(parsed.externalId);
  void tryAppendPlatformAuditEvent({
    source: AUDIT_SOURCE.WEBHOOK,
    category: AUDIT_CATEGORY.MONEY,
    action: AUDIT_ACTION.RAZORPAY_WEBHOOK_ACCEPTED,
    actorType: AUDIT_ACTOR_TYPE.PAYMENT_PROVIDER,
    actorId: params.provider,
    restaurantId: restaurant.id,
    correlationId: parsed.externalId,
    metadata: {
      providerEventId: parsed.externalId,
      providerOrderId: parsed.providerOrderId,
      amountPaise: parsed.amountPaise,
      currency: parsed.currency,
      orderId: parsed.orderId,
    },
  });

  if (!event) {
    return { ok: false as const, status: 503, error: "Webhook event could not be recorded" };
  }
  if (event.restaurantId !== restaurant.id) {
    return { ok: false as const, status: 409, error: "Webhook event restaurant mismatch" };
  }

  const result = await applyVerifiedWebhookPayment(restaurant.id, parsed, params.provider);
  if (result.ok) {
    await prisma.paymentWebhookEvent.updateMany({
      where: { id: event.id, restaurantId: restaurant.id },
      data: {
        status: "PROCESSED",
        processedAt: new Date(),
        tableId: parsed.tableId ?? result.tableId,
        orderId: parsed.orderId ?? result.orderId,
      },
    });
    void dispatchRealtimeNotifications({
      restaurantId: restaurant.id,
      type: "PAYMENT_RECEIVED",
      title: `Payment received — ${formatCurrency(parsed.amount)}`,
      body: result.message ?? "Auto-confirmed via payment gateway",
      tableNumber: result.tableNumber,
      urgent: true,
    });
    return { ok: true as const, status: 200, message: result.message ?? "Processed" };
  }

  await prisma.paymentWebhookEvent.updateMany({
    where: { id: event.id, restaurantId: restaurant.id },
    data: {
      status: "FAILED",
      processedAt: null,
      tableId: parsed.tableId ?? result.tableId,
      orderId: parsed.orderId ?? result.orderId,
    },
  });

  logWarn("payments:webhook", "Application failed; leaving retryable", {
    restaurantId: restaurant.id,
    provider: params.provider,
    externalId: parsed.externalId,
    message: result.message,
  });

  return {
    ok: false as const,
    status: result.retryable === false ? 409 : 503,
    error: result.message ?? "Payment application failed",
  };
}

function parseWebhookPayload(provider: string, payload: Record<string, unknown>) {
  if (provider === "razorpay") {
    const event = payload.event as string | undefined;
    if (event !== "payment.captured") return null;
    const entity = (payload.payload as { payment?: { entity?: Record<string, unknown> } })?.payment
      ?.entity;
    if (!entity) return null;
    const amountPaise = Number(entity.amount);
    const amount = amountPaise / 100;
    const externalId = String(entity.id);
    const notes = (entity.notes as Record<string, string>) ?? {};
    return {
      externalId,
      amount,
      amountPaise,
      currency: typeof entity.currency === "string" ? entity.currency : "INR",
      providerOrderId: typeof entity.order_id === "string" ? entity.order_id : undefined,
      tableId: notes.tableId,
      orderId: notes.orderId,
      reference: notes.reference,
    };
  }

  return null;
}

async function applyVerifiedWebhookPayment(
  restaurantId: string,
  parsed: {
    amount: number;
    amountPaise?: number;
    currency?: string;
    providerOrderId?: string;
    tableId?: string;
    orderId?: string;
    reference?: string;
    externalId?: string;
  },
  provider: string,
) {
  if (provider.toLowerCase() !== RAZORPAY_PROVIDER) {
    return {
      ok: false as const,
      message: "Automatic gateway not available for this provider yet",
      retryable: false,
    };
  }

  if (parsed.externalId) {
    const attempt =
      (parsed.providerOrderId
        ? await prisma.gatewayPaymentAttempt.findFirst({
            where: {
              restaurantId,
              provider: RAZORPAY_PROVIDER,
              providerOrderId: parsed.providerOrderId,
            },
          })
        : null) ??
      (await prisma.gatewayPaymentAttempt.findFirst({
        where: {
          restaurantId,
          provider: RAZORPAY_PROVIDER,
          providerPaymentId: parsed.externalId,
        },
      }));
    if (attempt) {
      const settled = await settleRazorpayCapture({
        restaurantId,
        attemptId: attempt.id,
        providerOrderId: parsed.providerOrderId ?? attempt.providerOrderId ?? undefined,
        providerPaymentId: parsed.externalId,
        amountPaise: parsed.amountPaise ?? attempt.amountPaise,
        currency: parsed.currency ?? "INR",
      });
      if (settled.ok) {
        const order = await prisma.order.findFirst({
          where: { id: attempt.orderId, restaurantId },
          include: { table: true },
        });
        return {
          ok: true as const,
          orderId: attempt.orderId,
          tableId: attempt.tableId,
          tableNumber: order?.table.number,
          message: "Razorpay payment captured",
        };
      }
      return {
        ok: false as const,
        message: settled.error,
        retryable: settled.status >= 500,
      };
    }
  }

  return applyAutoPayment(restaurantId, parsed, provider);
}

async function applyAutoPayment(
  restaurantId: string,
  parsed: {
    amount: number;
    tableId?: string;
    orderId?: string;
    reference?: string;
    externalId?: string;
  },
  provider: string,
) {
  const today = todayDateString();
  let orderId = parsed.orderId;
  let tableId = parsed.tableId;

  if (parsed.externalId) {
    const duplicate = await prisma.payment.findFirst({
      where: {
        restaurantId,
        provider,
        providerPaymentId: parsed.externalId,
        status: PAYMENT_STATUS.CAPTURED,
      },
    });
    if (duplicate) {
      return { ok: true as const, message: "Already captured", orderId: duplicate.orderId, tableId: duplicate.tableId };
    }
  }

  if (!orderId && parsed.reference) {
    const match = parsed.reference.match(/^T(\w+)-O(\w+)$/);
    if (match) {
      tableId = match[1];
      orderId = match[2];
    }
  }

  if (orderId) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId, date: today },
      include: { table: true },
    });
    if (!order) {
      return { ok: false as const, message: "Order not found or already paid", retryable: false };
    }
    if (order.paidAt) {
      return { ok: true as const, message: "Already paid", orderId: order.id, tableId: order.tableId, tableNumber: order.table.number };
    }
    const summary = await getOrderPaymentSummary(order.id);
    if (!summary || summary.remaining <= 0) {
      return { ok: false as const, message: "Nothing to pay", retryable: false };
    }
    if (parsed.amount > summary.remaining + FINANCIAL_PAID_EPSILON) {
      logWarn("payments:webhook", "Amount exceeds remaining", {
        restaurantId,
        orderId: order.id,
        amount: parsed.amount,
        remaining: summary.remaining,
      });
      return { ok: false as const, message: "Amount does not match bill remaining", retryable: false };
    }
    const result = await recordOrderPayment({
      orderId: order.id,
      amount: parsed.amount,
      method: "UPI",
      note: "Auto-confirmed via payment webhook",
      collectedByName: "Payment Gateway",
      provider,
      providerPaymentId: parsed.externalId,
      idempotencyKey: parsed.externalId ? `webhook:${provider}:${parsed.externalId}` : undefined,
      capture: true,
      status: PAYMENT_STATUS.CAPTURED,
    });
    if (!result.ok) {
      const retryable =
        result.status >= 500 ||
        result.error === "Order must be fully served before payment";
      return { ok: false as const, message: result.error, retryable };
    }
    return {
      ok: true as const,
      orderId: order.id,
      tableId: order.tableId,
      tableNumber: order.table.number,
      message: `Order #${order.orderNumber} marked paid`,
    };
  }

  if (tableId) {
    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        tableId,
        date: today,
        status: "SERVED",
        paidAt: null,
      },
      include: { table: true },
      orderBy: { orderNumber: "asc" },
    });
    if (orders.length > 1) {
      logWarn("payments:webhook", "Refusing multi-order table automatic payment", {
        restaurantId,
        tableId,
        orderCount: orders.length,
        externalId: parsed.externalId,
      });
      return {
        ok: false as const,
        message: "Automatic table payment cannot be split across multiple unpaid orders",
        retryable: false,
        tableId,
        tableNumber: orders[0]?.table.number,
      };
    }
    if (orders.length === 1) {
      return applyAutoPayment(
        restaurantId,
        { ...parsed, orderId: orders[0]!.id, tableId },
        provider,
      );
    }
  }

  return { ok: false as const, message: "Could not match payment to order/table", retryable: false };
}

export function buildPaymentReference(tableId: string, orderId: string) {
  return `T${tableId}-O${orderId}`;
}

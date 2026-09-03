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

export async function getPaymentGatewaySettings(restaurantId: string) {
  const row = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      paymentGatewayProvider: true,
      paymentGatewayKeyId: true,
      paymentWebhookSecret: true,
      slug: true,
    },
  });
  if (!row) return null;
  return {
    provider: row.paymentGatewayProvider,
    keyId: row.paymentGatewayKeyId,
    webhookConfigured: Boolean(row.paymentWebhookSecret),
    webhookUrl: `${getAppBaseUrl()}/api/webhooks/payment/${row.slug}`,
  };
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
  if (data.keyId !== undefined) update.paymentGatewayKeyId = data.keyId;
  if (data.webhookSecret !== undefined) update.paymentWebhookSecret = data.webhookSecret;
  if (data.secret !== undefined) {
    update.paymentGatewaySecretEnc = data.secret
      ? encryptSecret(data.secret)
      : null;
  }

  return prisma.restaurant.update({
    where: { id: restaurantId },
    data: update,
    select: {
      paymentGatewayProvider: true,
      paymentGatewayKeyId: true,
      paymentWebhookSecret: true,
    },
  });
}

export async function processPaymentWebhook(params: {
  slug: string;
  provider: string;
  rawBody: string;
  headers: Headers;
}) {
  const restaurant = await prisma.restaurant.findUnique({ where: { slug: params.slug } });
  if (!restaurant) return { ok: false as const, status: 404, error: "Restaurant not found" };

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

  const webhookSecret = restaurant.paymentWebhookSecret;
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

  if (!event) {
    return { ok: false as const, status: 503, error: "Webhook event could not be recorded" };
  }
  if (event.restaurantId !== restaurant.id) {
    return { ok: false as const, status: 409, error: "Webhook event restaurant mismatch" };
  }

  const result = await applyAutoPayment(restaurant.id, parsed, params.provider);
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
    const amount = Number(entity.amount) / 100;
    const externalId = String(entity.id);
    const notes = (entity.notes as Record<string, string>) ?? {};
    return {
      externalId,
      amount,
      tableId: notes.tableId,
      orderId: notes.orderId,
      reference: notes.reference,
    };
  }

  if (provider === "phonepe" || provider === "paytm") {
    const data = (payload.data ?? payload) as Record<string, unknown>;
    const amount = Number(data.amount ?? data.transactionAmount ?? 0) / (provider === "phonepe" ? 100 : 1);
    const externalId = String(data.transactionId ?? data.merchantTransactionId ?? data.orderId ?? "");
    const meta = (data.metaInfo ?? data.notes ?? data) as Record<string, string>;
    return {
      externalId,
      amount,
      tableId: meta.tableId,
      orderId: meta.orderId,
      reference: meta.reference ?? meta.udf1,
    };
  }

  return null;
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

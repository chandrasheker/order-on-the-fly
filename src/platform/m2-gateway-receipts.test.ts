import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { computeOrderFinancials } from "@/lib/order-financials";
import { toPaise } from "@/lib/money";
import { todayDateString } from "@/lib/utils";
import { encryptSecret } from "@/lib/credential-crypto";
import { isHighEntropyPublicToken } from "@/lib/public-token";
import type { RazorpayHttpTransport, RazorpayRequest } from "@/lib/razorpay-client";
import {
  isValidRazorpayRefundIdempotencyKey,
  RAZORPAY_REFUND_IDEMPOTENCY_HEADER,
} from "@/lib/razorpay-client";
import { classifyHostname } from "@/platform/host";
import type { HostTenantResolution } from "@/platform/host-tenant";

const dbPath = path.join(os.tmpdir(), `tabletap-m2-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_URL = `file:${dbPath}`;
process.env.JWT_SECRET = process.env.JWT_SECRET || "m2-test-jwt-secret-must-be-32-chars!!";

let prisma: PrismaClient;
let createOrReuseRazorpayCheckout: typeof import("@/lib/gateway-payment-service").createOrReuseRazorpayCheckout;
let verifyRazorpayCheckoutCallback: typeof import("@/lib/gateway-payment-service").verifyRazorpayCheckoutCallback;
let settleRazorpayCapture: typeof import("@/lib/gateway-payment-service").settleRazorpayCapture;
let refundAutomaticPayment: typeof import("@/lib/gateway-payment-service").refundAutomaticPayment;
let getGatewayAttemptPublicStatus: typeof import("@/lib/gateway-payment-service").getGatewayAttemptPublicStatus;
let cancelGatewayAttempt: typeof import("@/lib/gateway-payment-service").cancelGatewayAttempt;
let recordOrderPayment: typeof import("@/lib/payment-allocation-service").recordOrderPayment;
let initiateManualUpiPayment: typeof import("@/lib/payment-allocation-service").initiateManualUpiPayment;
let processPaymentWebhook: typeof import("@/lib/payment-webhook-service").processPaymentWebhook;
let getPaymentGatewaySettings: typeof import("@/lib/payment-webhook-service").getPaymentGatewaySettings;
let updatePaymentGatewaySettings: typeof import("@/lib/payment-webhook-service").updatePaymentGatewaySettings;
let getPublicReceiptByToken: typeof import("@/lib/public-receipt-service").getPublicReceiptByToken;
let voidOrderBill: typeof import("@/lib/bill-service").voidOrderBill;
let setRazorpayTransportForTests: typeof import("@/lib/razorpay-client").setRazorpayTransportForTests;
let invalidateFeatureCache: typeof import("@/lib/feature-flags").invalidateFeatureCache;
let canMutatePaymentGatewayCredentials: typeof import("@/lib/auth").canMutatePaymentGatewayCredentials;
let publicCustomerHostScope: typeof import("@/platform/tenant-scope").publicCustomerHostScope;

type FakeOrder = { id: string; amount: number; currency: string; receipt?: string; status: string };
type FakePayment = { id: string; order_id: string; amount: number; currency: string; status: string };
type FakeRefund = { id: string; payment_id: string; amount: number; status: string };

function createFakeRazorpay() {
  const orders = new Map<string, FakeOrder>();
  const payments = new Map<string, FakePayment>();
  const refunds = new Map<string, FakeRefund>();
  const refundKeys = new Map<string, FakeRefund>();
  const refundRequests: Array<{
    path: string;
    paymentId: string;
    amount: number;
    refundIdempotencyKey?: string;
    genericIdempotencyKey?: string;
  }> = [];
  let createCalls = 0;
  let failNextCreate: "retryable" | "permanent" | null = null;
  let failNextRefund: "network" | "conflict" | null = null;
  let refundMode: "processed" | "failed" | "pending" = "processed";

  const transport: RazorpayHttpTransport = async (req: RazorpayRequest) => {
    if (req.method === "POST" && req.path === "/orders") {
      createCalls += 1;
      const body = req.body as { amount: number; currency: string; receipt: string };
      const id = `order_${createCalls}_${body.receipt}`;
      const order = { id, amount: body.amount, currency: body.currency, receipt: body.receipt, status: "created" };
      orders.set(id, order);
      if (failNextCreate === "retryable") {
        failNextCreate = null;
        return { status: 0, json: null, retryable: true };
      }
      if (failNextCreate === "permanent") {
        failNextCreate = null;
        orders.delete(id);
        return { status: 400, json: { error: { description: "invalid amount" } }, retryable: false };
      }
      return { status: 200, json: order, retryable: false };
    }
    if (req.method === "GET" && req.path.startsWith("/orders?receipt=")) {
      const receipt = decodeURIComponent(req.path.split("receipt=")[1]?.split("&")[0] ?? "");
      const found = [...orders.values()].find((row) => row.receipt === receipt);
      return { status: 200, json: { items: found ? [found] : [] }, retryable: false };
    }
    if (req.method === "GET" && req.path.startsWith("/orders/")) {
      const id = decodeURIComponent(req.path.slice("/orders/".length));
      const order = orders.get(id);
      if (!order) return { status: 404, json: { error: { description: "not found" } }, retryable: false };
      return { status: 200, json: order, retryable: false };
    }
    if (req.method === "GET" && req.path.startsWith("/payments/") && !req.path.endsWith("/refund")) {
      const id = decodeURIComponent(req.path.slice("/payments/".length));
      const payment = payments.get(id);
      if (!payment) return { status: 404, json: { error: { description: "not found" } }, retryable: false };
      return { status: 200, json: payment, retryable: false };
    }
    const refundMatch = req.method === "POST" ? /^\/payments\/([^/]+)\/refund$/.exec(req.path) : null;
    if (refundMatch) {
      const paymentId = decodeURIComponent(refundMatch[1] ?? "");
      const body = req.body as { amount: number };
      refundRequests.push({
        path: req.path,
        paymentId,
        amount: body.amount,
        refundIdempotencyKey: req.refundIdempotencyKey,
        genericIdempotencyKey: req.idempotencyKey,
      });
      if (req.refundIdempotencyKey && refundKeys.has(req.refundIdempotencyKey)) {
        return { status: 200, json: refundKeys.get(req.refundIdempotencyKey), retryable: false };
      }
      if (failNextRefund === "network") {
        failNextRefund = null;
        return { status: 0, json: null, retryable: true };
      }
      if (failNextRefund === "conflict") {
        failNextRefund = null;
        return {
          status: 409,
          json: { error: { description: "A refund with this idempotency key is in progress" } },
          retryable: false,
        };
      }
      if (refundMode === "failed") {
        return { status: 400, json: { error: { description: "refund failed" } }, retryable: false };
      }
      const refund = {
        id: `rfnd_${refunds.size + 1}`,
        payment_id: paymentId,
        amount: body.amount,
        status: refundMode === "pending" ? "pending" : "processed",
      };
      refunds.set(refund.id, refund);
      if (req.refundIdempotencyKey) refundKeys.set(req.refundIdempotencyKey, refund);
      return { status: 200, json: refund, retryable: false };
    }
    return { status: 404, json: null, retryable: false };
  };

  return {
    transport,
    orders,
    payments,
    refunds,
    refundRequests,
    createCalls: () => createCalls,
    failNextCreate(kind: "retryable" | "permanent") {
      failNextCreate = kind;
    },
    failNextRefund(kind: "network" | "conflict") {
      failNextRefund = kind;
    },
    setRefundMode(mode: "processed" | "failed" | "pending") {
      refundMode = mode;
    },
    addPayment(payment: FakePayment) {
      payments.set(payment.id, payment);
    },
  };
}

const fake = createFakeRazorpay();

before(async () => {
  execFileSync(
    process.execPath,
    [
      path.join(process.cwd(), "scripts", "run-with-mem.js"),
      "npx",
      "prisma",
      "db",
      "push",
      "--url",
      `file:${dbPath}`,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
      stdio: "inherit",
    },
  );
  ({ prisma } = await import("@/lib/prisma"));
  ({
    createOrReuseRazorpayCheckout,
    verifyRazorpayCheckoutCallback,
    settleRazorpayCapture,
    refundAutomaticPayment,
    getGatewayAttemptPublicStatus,
    cancelGatewayAttempt,
  } = await import("@/lib/gateway-payment-service"));
  ({ recordOrderPayment, initiateManualUpiPayment } = await import(
    "@/lib/payment-allocation-service"
  ));
  ({ processPaymentWebhook, getPaymentGatewaySettings, updatePaymentGatewaySettings } = await import(
    "@/lib/payment-webhook-service"
  ));
  ({ getPublicReceiptByToken } = await import("@/lib/public-receipt-service"));
  ({ voidOrderBill } = await import("@/lib/bill-service"));
  ({ setRazorpayTransportForTests } = await import("@/lib/razorpay-client"));
  ({ invalidateFeatureCache } = await import("@/lib/feature-flags"));
  ({ canMutatePaymentGatewayCredentials } = await import("@/lib/auth"));
  ({ publicCustomerHostScope } = await import("@/platform/tenant-scope"));
  setRazorpayTransportForTests(fake.transport);
});

after(async () => {
  setRazorpayTransportForTests(null);
  if (prisma) await prisma.$disconnect().catch(() => undefined);
  for (const extra of ["", "-wal", "-shm", "-journal"]) {
    fs.rmSync(`${dbPath}${extra}`, { force: true });
  }
});

async function seedRestaurant(suffix: string, extras?: { gst?: boolean; razorpay?: boolean; provider?: "RAZORPAY" | "PHONEPE" }) {
  const restaurant = await prisma.restaurant.create({
    data: {
      name: `R ${suffix}`,
      nameNormalized: `r ${suffix}`,
      slug: `r-${suffix}`,
      receiptGstEnabled: Boolean(extras?.gst),
      receiptGstRate: 5,
      receiptFooter: "Thanks",
      paymentGatewayProvider: extras?.razorpay || extras?.provider ? extras?.provider ?? "RAZORPAY" : null,
      paymentGatewayKeyId: extras?.razorpay ? "rzp_test_key" : extras?.provider ? "key_id" : null,
      paymentGatewaySecretEnc: extras?.razorpay ? encryptSecret("rzp_test_secret") : null,
      paymentWebhookSecretEnc: extras?.razorpay ? encryptSecret("whsec_test") : extras?.provider ? encryptSecret("whsec_test") : null,
      featureFlags: extras?.razorpay || extras?.provider ? JSON.stringify({ payment_webhooks: true }) : "{}",
    },
  });
  if (extras?.razorpay || extras?.provider) invalidateFeatureCache(restaurant.id);
  const table = await prisma.table.create({
    data: { number: 4, restaurantId: restaurant.id, qrToken: `qr-${suffix}` },
  });
  const category = await prisma.menuCategory.create({
    data: { name: "Mains", slug: `mains-${suffix}`, restaurantId: restaurant.id },
  });
  const menuItem = await prisma.menuItem.create({
    data: { name: "Tea", price: 200, categoryId: category.id },
  });
  return { restaurant, table, menuItem };
}

async function seedServedOrder(params: {
  restaurantId: string;
  tableId: string;
  menuItemId: string;
  orderNumber: number;
  unitPrice: number;
  discountAmount?: number;
}) {
  const order = await prisma.order.create({
    data: {
      orderNumber: params.orderNumber,
      restaurantId: params.restaurantId,
      tableId: params.tableId,
      status: "SERVED",
      discountAmount: params.discountAmount ?? 0,
      date: todayDateString(),
    },
  });
  await prisma.orderItem.create({
    data: {
      orderId: order.id,
      menuItemId: params.menuItemId,
      itemName: "Tea",
      unitPrice: params.unitPrice,
      quantity: 1,
      status: "SERVED",
      prepTimeMinutes: 5,
      expectedReadyAt: new Date(),
    },
  });
  return order;
}

function checkoutSignature(orderId: string, paymentId: string, secret = "rzp_test_secret") {
  return crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}

function signedRazorpay(body: Record<string, unknown>, secret = "whsec_test") {
  const rawBody = JSON.stringify(body);
  return {
    rawBody,
    headers: new Headers({
      "x-razorpay-signature": crypto.createHmac("sha256", secret).update(rawBody).digest("hex"),
    }),
  };
}

describe("M2 gateway receipts", () => {
  it("uses exact canonical due including GST/discount and ignores any client amount field", async () => {
    const suffix = `due-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix, { gst: true, razorpay: true });
    const order = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 200,
      discountAmount: 50,
    });
    const financials = computeOrderFinancials({
      items: [{ unitPrice: 200, quantity: 1, status: "SERVED" }],
      discountAmount: 50,
      gstEnabled: true,
      gstRate: 5,
    });
    const created = await createOrReuseRazorpayCheckout({
      restaurantId: restaurant.id,
      orderId: order.id,
      tableId: table.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.checkout.amountPaise, toPaise(financials.amountDue));
    assert.notEqual(created.checkout.amountPaise, 20000);
    const attempt = await prisma.gatewayPaymentAttempt.findUnique({
      where: { publicToken: created.checkout.publicToken },
    });
    assert.equal(attempt?.restaurantId, restaurant.id);
    assert.equal(attempt?.amountPaise, toPaise(financials.amountDue));
  });

  it("reuses one active attempt for concurrent create requests", async () => {
    const suffix = `race-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix, { razorpay: true });
    const order = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 120,
    });
    const [a, b] = await Promise.all([
      createOrReuseRazorpayCheckout({ restaurantId: restaurant.id, orderId: order.id, tableId: table.id }),
      createOrReuseRazorpayCheckout({ restaurantId: restaurant.id, orderId: order.id, tableId: table.id }),
    ]);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    if (!a.ok || !b.ok) return;
    assert.equal(a.checkout.publicToken, b.checkout.publicToken);
    const count = await prisma.gatewayPaymentAttempt.count({ where: { orderId: order.id } });
    assert.equal(count, 1);
  });

  it("recovers a Razorpay order by receipt after an ambiguous create", async () => {
    fake.failNextCreate("retryable");
    const suffix = `amb-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix, { razorpay: true });
    const order = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 90,
    });
    const recovered = await createOrReuseRazorpayCheckout({
      restaurantId: restaurant.id,
      orderId: order.id,
      tableId: table.id,
    });
    assert.equal(recovered.ok, true);
    if (!recovered.ok) return;
    assert.ok(recovered.checkout.orderId);
    const attempts = await prisma.gatewayPaymentAttempt.findMany({ where: { orderId: order.id } });
    assert.equal(attempts.length, 1);
    assert.ok(attempts[0]?.providerOrderId);
  });

  it("rejects invalid checkout signatures and does not capture from signature alone", async () => {
    const suffix = `sig-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix, { razorpay: true });
    const order = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 110,
    });
    const created = await createOrReuseRazorpayCheckout({
      restaurantId: restaurant.id,
      orderId: order.id,
      tableId: table.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const invalid = await verifyRazorpayCheckoutCallback({
      publicToken: created.checkout.publicToken,
      restaurantId: restaurant.id,
      razorpayPaymentId: "pay_bad",
      razorpaySignature: "00".repeat(32),
    });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.status, 401);
    fake.addPayment({
      id: "pay_authorized",
      order_id: created.checkout.orderId!,
      amount: created.checkout.amountPaise,
      currency: "INR",
      status: "authorized",
    });
    const authorized = await verifyRazorpayCheckoutCallback({
      publicToken: created.checkout.publicToken,
      restaurantId: restaurant.id,
      razorpayPaymentId: "pay_authorized",
      razorpaySignature: checkoutSignature(created.checkout.orderId!, "pay_authorized"),
    });
    assert.equal(authorized.ok, false);
    const captured = await prisma.payment.count({
      where: { orderId: order.id, status: "CAPTURED" },
    });
    assert.equal(captured, 0);
  });

  it("creates exactly one captured Payment for browser+webhook concurrency and replay", async () => {
    const suffix = `cap-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix, { razorpay: true });
    const order = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 130,
    });
    const created = await createOrReuseRazorpayCheckout({
      restaurantId: restaurant.id,
      orderId: order.id,
      tableId: table.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const paymentId = `pay_${suffix}`;
    fake.addPayment({
      id: paymentId,
      order_id: created.checkout.orderId!,
      amount: created.checkout.amountPaise,
      currency: "INR",
      status: "captured",
    });
    const payload = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: paymentId,
            amount: created.checkout.amountPaise,
            currency: "INR",
            order_id: created.checkout.orderId,
          },
        },
      },
    };
    const [browser, webhook] = await Promise.all([
      verifyRazorpayCheckoutCallback({
        publicToken: created.checkout.publicToken,
        restaurantId: restaurant.id,
        razorpayPaymentId: paymentId,
        razorpaySignature: checkoutSignature(created.checkout.orderId!, paymentId),
      }),
      processPaymentWebhook({
        slug: restaurant.slug,
        provider: "razorpay",
        ...signedRazorpay(payload),
      }),
    ]);
    assert.equal(browser.ok || webhook.ok, true);
    const replay = await processPaymentWebhook({
      slug: restaurant.slug,
      provider: "razorpay",
      ...signedRazorpay(payload),
    });
    assert.equal(replay.ok, true);
    const payments = await prisma.payment.findMany({
      where: { orderId: order.id, status: "CAPTURED" },
    });
    assert.equal(payments.length, 1);
    assert.equal(payments[0]?.provider, "razorpay");
    assert.equal(payments[0]?.providerPaymentId, paymentId);
    const status = await getGatewayAttemptPublicStatus(created.checkout.publicToken, restaurant.id);
    assert.equal(status?.paid, true);
    assert.ok(status?.receiptUrl);
    assert.ok(!JSON.stringify(status).includes("rzp_test_secret"));
  });

  it("fails closed for wrong amount, currency, order association, and cross-restaurant IDs", async () => {
    const suffix = `sec-${Date.now()}`;
    const a = await seedRestaurant(`${suffix}-a`, { razorpay: true });
    const b = await seedRestaurant(`${suffix}-b`, { razorpay: true });
    const orderA = await seedServedOrder({
      restaurantId: a.restaurant.id,
      tableId: a.table.id,
      menuItemId: a.menuItem.id,
      orderNumber: 1,
      unitPrice: 100,
    });
    const orderB = await seedServedOrder({
      restaurantId: b.restaurant.id,
      tableId: b.table.id,
      menuItemId: b.menuItem.id,
      orderNumber: 1,
      unitPrice: 150,
    });
    const createdA = await createOrReuseRazorpayCheckout({
      restaurantId: a.restaurant.id,
      orderId: orderA.id,
      tableId: a.table.id,
    });
    const createdB = await createOrReuseRazorpayCheckout({
      restaurantId: b.restaurant.id,
      orderId: orderB.id,
      tableId: b.table.id,
    });
    assert.equal(createdA.ok && createdB.ok, true);
    if (!createdA.ok || !createdB.ok) return;
    fake.addPayment({
      id: "pay_wrong_amt",
      order_id: createdA.checkout.orderId!,
      amount: createdA.checkout.amountPaise,
      currency: "INR",
      status: "captured",
    });
    const wrongAmount = await settleRazorpayCapture({
      restaurantId: a.restaurant.id,
      attemptId: (await prisma.gatewayPaymentAttempt.findUnique({
        where: { publicToken: createdA.checkout.publicToken },
      }))!.id,
      providerOrderId: createdA.checkout.orderId!,
      providerPaymentId: "pay_wrong_amt",
      amountPaise: createdA.checkout.amountPaise + 1,
    });
    assert.equal(wrongAmount.ok, false);
    const wrongCurrency = await settleRazorpayCapture({
      restaurantId: a.restaurant.id,
      attemptId: (await prisma.gatewayPaymentAttempt.findUnique({
        where: { publicToken: createdA.checkout.publicToken },
      }))!.id,
      providerOrderId: createdA.checkout.orderId!,
      providerPaymentId: "pay_wrong_amt",
      amountPaise: createdA.checkout.amountPaise,
      currency: "USD",
    });
    assert.equal(wrongCurrency.ok, false);
    fake.addPayment({
      id: "pay_wrong_order",
      order_id: createdB.checkout.orderId!,
      amount: createdA.checkout.amountPaise,
      currency: "INR",
      status: "captured",
    });
    const wrongOrder = await settleRazorpayCapture({
      restaurantId: a.restaurant.id,
      attemptId: (await prisma.gatewayPaymentAttempt.findUnique({
        where: { publicToken: createdA.checkout.publicToken },
      }))!.id,
      providerOrderId: createdA.checkout.orderId!,
      providerPaymentId: "pay_wrong_order",
      amountPaise: createdA.checkout.amountPaise,
    });
    assert.equal(wrongOrder.ok, false);
    const cross = await verifyRazorpayCheckoutCallback({
      publicToken: createdA.checkout.publicToken,
      restaurantId: b.restaurant.id,
      razorpayPaymentId: "pay_wrong_amt",
      razorpaySignature: checkoutSignature(createdA.checkout.orderId!, "pay_wrong_amt"),
    });
    assert.equal(cross.ok, false);
    assert.equal(cross.status, 404);
    const payments = await prisma.payment.count({
      where: { restaurantId: { in: [a.restaurant.id, b.restaurant.id] }, status: "CAPTURED" },
    });
    assert.equal(payments, 0);
  });

  it("keeps multi-order automatic checkout unavailable and blocks cash/manual races", async () => {
    const suffix = `multi-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix, { razorpay: true });
    const first = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 80,
    });
    await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 2,
      unitPrice: 90,
    });
    const multi = await createOrReuseRazorpayCheckout({
      restaurantId: restaurant.id,
      orderId: first.id,
      tableId: table.id,
    });
    assert.equal(multi.ok, false);
    if (multi.ok) return;
    assert.match(multi.error, /staff/i);

    const singleTable = await prisma.table.create({
      data: { number: 8, restaurantId: restaurant.id, qrToken: `qr-single-${suffix}` },
    });
    const single = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: singleTable.id,
      menuItemId: menuItem.id,
      orderNumber: 3,
      unitPrice: 70,
    });
    const created = await createOrReuseRazorpayCheckout({
      restaurantId: restaurant.id,
      orderId: single.id,
      tableId: singleTable.id,
    });
    assert.equal(created.ok, true);
    const cash = await recordOrderPayment({
      orderId: single.id,
      amount: 70,
      method: "CASH",
      capture: true,
    });
    assert.equal(cash.ok, false);
    if (!cash.ok) assert.match(cash.error, /Automatic payment/i);
    const manual = await initiateManualUpiPayment({ orderId: single.id, tableId: singleTable.id });
    assert.equal(manual.ok, false);
  });

  it("does not create a captured Payment when the provider reports failure", async () => {
    const suffix = `fail-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix, { razorpay: true });
    const order = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 60,
    });
    const created = await createOrReuseRazorpayCheckout({
      restaurantId: restaurant.id,
      orderId: order.id,
      tableId: table.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    fake.addPayment({
      id: "pay_failed",
      order_id: created.checkout.orderId!,
      amount: created.checkout.amountPaise,
      currency: "INR",
      status: "failed",
    });
    const settled = await settleRazorpayCapture({
      restaurantId: restaurant.id,
      providerOrderId: created.checkout.orderId!,
      providerPaymentId: "pay_failed",
      amountPaise: created.checkout.amountPaise,
    });
    assert.equal(settled.ok, false);
    assert.equal(await prisma.payment.count({ where: { orderId: order.id, status: "CAPTURED" } }), 0);
  });

  it("refunds through the provider exactly once and rejects over-refunds/failures", async () => {
    const suffix = `ref-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix, { razorpay: true });
    const order = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 200,
    });
    const created = await createOrReuseRazorpayCheckout({
      restaurantId: restaurant.id,
      orderId: order.id,
      tableId: table.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const paymentId = `pay_ref_${suffix}`;
    fake.addPayment({
      id: paymentId,
      order_id: created.checkout.orderId!,
      amount: created.checkout.amountPaise,
      currency: "INR",
      status: "captured",
    });
    const settled = await settleRazorpayCapture({
      restaurantId: restaurant.id,
      providerOrderId: created.checkout.orderId!,
      providerPaymentId: paymentId,
      amountPaise: created.checkout.amountPaise,
    });
    assert.equal(settled.ok, true);
    if (!settled.ok || !settled.payment) return;

    const requestKey = `tabletap-refund-${crypto.randomUUID()}`;
    const first = await refundAutomaticPayment({
      paymentId: settled.payment.id,
      restaurantId: restaurant.id,
      amount: 50,
      requestId: requestKey,
    });
    assert.equal(first.ok, true);
    const retry = await refundAutomaticPayment({
      paymentId: settled.payment.id,
      restaurantId: restaurant.id,
      amount: 50,
      requestId: requestKey,
    });
    assert.equal(retry.ok, true);
    if (retry.ok && first.ok) {
      assert.equal(retry.payment.id, first.payment.id);
    }
    const over = await refundAutomaticPayment({
      paymentId: settled.payment.id,
      restaurantId: restaurant.id,
      amount: 200,
      requestId: `tabletap-refund-${crypto.randomUUID()}`,
    });
    assert.equal(over.ok, false);

    fake.setRefundMode("failed");
    const failed = await refundAutomaticPayment({
      paymentId: settled.payment.id,
      restaurantId: restaurant.id,
      amount: 25,
      requestId: `tabletap-refund-${crypto.randomUUID()}`,
    });
    assert.equal(failed.ok, false);
    const refundRows = await prisma.payment.findMany({
      where: { restaurantId: restaurant.id, refundOfPaymentId: settled.payment.id },
    });
    assert.equal(refundRows.length, 1);
    fake.setRefundMode("processed");
  });

  it("issues unique high-entropy host-scoped receipts from the immutable snapshot", async () => {
    const suffix = `rcpt-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix, { razorpay: true });
    const order = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 140,
    });
    const created = await createOrReuseRazorpayCheckout({
      restaurantId: restaurant.id,
      orderId: order.id,
      tableId: table.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const paymentId = `pay_rcpt_${suffix}`;
    fake.addPayment({
      id: paymentId,
      order_id: created.checkout.orderId!,
      amount: created.checkout.amountPaise,
      currency: "INR",
      status: "captured",
    });
    const settled = await settleRazorpayCapture({
      restaurantId: restaurant.id,
      providerOrderId: created.checkout.orderId!,
      providerPaymentId: paymentId,
      amountPaise: created.checkout.amountPaise,
    });
    assert.equal(settled.ok, true);
    const bill = await prisma.bill.findFirst({ where: { orderId: order.id } });
    assert.ok(bill?.publicToken);
    assert.equal(isHighEntropyPublicToken(bill.publicToken), true);
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { receiptFooter: "CHANGED AFTER FINALIZE", name: "Renamed" },
    });
    const receipt = await getPublicReceiptByToken({
      token: bill.publicToken!,
      hostRestaurantId: restaurant.id,
    });
    assert.ok(receipt);
    assert.equal(receipt.footer, "Thanks");
    assert.equal(receipt.restaurant.name, `R ${suffix}`);
    const wrongHost = await getPublicReceiptByToken({
      token: bill.publicToken!,
      hostRestaurantId: "other-restaurant",
    });
    assert.equal(wrongHost, null);
    await voidOrderBill({ orderId: order.id, restaurantId: restaurant.id, reason: "test" });
    const voided = await getPublicReceiptByToken({
      token: bill.publicToken!,
      hostRestaurantId: restaurant.id,
    });
    assert.equal(voided, null);
  });

  it("never returns gateway secrets and refuses PhonePe/Paytm automatic settlement", async () => {
    const suffix = `cfg-${Date.now()}`;
    const { restaurant } = await seedRestaurant(suffix, { razorpay: true });
    const settings = await getPaymentGatewaySettings(restaurant.id);
    const encoded = JSON.stringify(settings);
    assert.equal(settings?.configured, true);
    assert.equal(settings?.keyId, "rzp_test_key");
    assert.ok(!encoded.includes("rzp_test_secret"));
    assert.ok(!encoded.includes("whsec_test"));
    assert.ok(!encoded.includes("paymentGatewaySecretEnc"));
    await updatePaymentGatewaySettings(restaurant.id, { keyId: "rzp_test_key" });
    const after = await getPaymentGatewaySettings(restaurant.id);
    assert.ok(!JSON.stringify(after).includes("rzp_test_secret"));

    const phonepe = await seedRestaurant(`${suffix}-pp`, { provider: "PHONEPE" });
    const refused = await processPaymentWebhook({
      slug: phonepe.restaurant.slug,
      provider: "phonepe",
      rawBody: "{}",
      headers: new Headers({ authorization: "Bearer whsec_test" }),
    });
    assert.equal(refused.ok, false);
    assert.equal(refused.status, 409);
  });

  it("does not refund the same Razorpay payment when browser verify then webhook confirm it", async () => {
    const suffix = `seq-a-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix, { razorpay: true });
    const order = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 125,
    });
    const created = await createOrReuseRazorpayCheckout({
      restaurantId: restaurant.id,
      orderId: order.id,
      tableId: table.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const paymentId = `pay_seq_a_${suffix}`;
    fake.addPayment({
      id: paymentId,
      order_id: created.checkout.orderId!,
      amount: created.checkout.amountPaise,
      currency: "INR",
      status: "captured",
    });
    const refundsBefore = fake.refunds.size;
    const browser = await verifyRazorpayCheckoutCallback({
      publicToken: created.checkout.publicToken,
      restaurantId: restaurant.id,
      razorpayPaymentId: paymentId,
      razorpaySignature: checkoutSignature(created.checkout.orderId!, paymentId),
    });
    assert.equal(browser.ok, true);
    const payload = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: paymentId,
            amount: created.checkout.amountPaise,
            currency: "INR",
            order_id: created.checkout.orderId,
          },
        },
      },
    };
    const webhook = await processPaymentWebhook({
      slug: restaurant.slug,
      provider: "razorpay",
      ...signedRazorpay(payload),
    });
    assert.equal(webhook.ok, true);
    const payments = await prisma.payment.findMany({
      where: { orderId: order.id, status: "CAPTURED", refundOfPaymentId: null },
    });
    assert.equal(payments.length, 1);
    assert.equal(payments[0]?.providerPaymentId, paymentId);
    assert.equal(fake.refunds.size, refundsBefore);
    const attempt = await prisma.gatewayPaymentAttempt.findUnique({
      where: { publicToken: created.checkout.publicToken },
    });
    assert.equal(attempt?.status, "CAPTURED");
    assert.equal(attempt?.providerPaymentId, paymentId);
  });

  it("does not refund the same Razorpay payment when webhook then browser verify confirm it", async () => {
    const suffix = `seq-b-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix, { razorpay: true });
    const order = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 135,
    });
    const created = await createOrReuseRazorpayCheckout({
      restaurantId: restaurant.id,
      orderId: order.id,
      tableId: table.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const paymentId = `pay_seq_b_${suffix}`;
    fake.addPayment({
      id: paymentId,
      order_id: created.checkout.orderId!,
      amount: created.checkout.amountPaise,
      currency: "INR",
      status: "captured",
    });
    const refundsBefore = fake.refunds.size;
    const payload = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: paymentId,
            amount: created.checkout.amountPaise,
            currency: "INR",
            order_id: created.checkout.orderId,
          },
        },
      },
    };
    const webhook = await processPaymentWebhook({
      slug: restaurant.slug,
      provider: "razorpay",
      ...signedRazorpay(payload),
    });
    assert.equal(webhook.ok, true);
    const browser = await verifyRazorpayCheckoutCallback({
      publicToken: created.checkout.publicToken,
      restaurantId: restaurant.id,
      razorpayPaymentId: paymentId,
      razorpaySignature: checkoutSignature(created.checkout.orderId!, paymentId),
    });
    assert.equal(browser.ok, true);
    const payments = await prisma.payment.findMany({
      where: { orderId: order.id, status: "CAPTURED", refundOfPaymentId: null },
    });
    assert.equal(payments.length, 1);
    assert.equal(payments[0]?.providerPaymentId, paymentId);
    assert.equal(fake.refunds.size, refundsBefore);
    const attempt = await prisma.gatewayPaymentAttempt.findUnique({
      where: { publicToken: created.checkout.publicToken },
    });
    assert.equal(attempt?.status, "CAPTURED");
    assert.equal(attempt?.providerPaymentId, paymentId);
  });

  it("refunds only a different captured provider payment after another method settled the order", async () => {
    const suffix = `late-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix, { razorpay: true });
    const order = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 95,
    });
    const created = await createOrReuseRazorpayCheckout({
      restaurantId: restaurant.id,
      orderId: order.id,
      tableId: table.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const cancelled = await cancelGatewayAttempt({
      publicToken: created.checkout.publicToken,
      restaurantId: restaurant.id,
    });
    assert.equal(cancelled.ok, true);
    const cash = await recordOrderPayment({
      orderId: order.id,
      amount: 95,
      method: "CASH",
      capture: true,
    });
    assert.equal(cash.ok, true);
    const competingId = `pay_late_${suffix}`;
    fake.addPayment({
      id: competingId,
      order_id: created.checkout.orderId!,
      amount: created.checkout.amountPaise,
      currency: "INR",
      status: "captured",
    });
    const refundsBefore = fake.refunds.size;
    const late = await settleRazorpayCapture({
      restaurantId: restaurant.id,
      providerOrderId: created.checkout.orderId!,
      providerPaymentId: competingId,
      amountPaise: created.checkout.amountPaise,
    });
    assert.equal(late.ok, false);
    assert.match(late.error, /was refunded/);
    assert.equal(fake.refunds.size, refundsBefore + 1);
    assert.equal(await prisma.payment.count({
      where: { orderId: order.id, provider: "razorpay", status: "CAPTURED" },
    }), 0);
    const attempt = await prisma.gatewayPaymentAttempt.findUnique({
      where: { publicToken: created.checkout.publicToken },
    });
    assert.equal(attempt?.status, "REFUNDED");
    assert.equal(attempt?.providerPaymentId, competingId);

    const pendingTable = await prisma.table.create({
      data: { number: 9, restaurantId: restaurant.id, qrToken: `qr-late-pending-${suffix}` },
    });
    const pendingOrder = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: pendingTable.id,
      menuItemId: menuItem.id,
      orderNumber: 2,
      unitPrice: 95,
    });
    const pendingCheckout = await createOrReuseRazorpayCheckout({
      restaurantId: restaurant.id,
      orderId: pendingOrder.id,
      tableId: pendingTable.id,
    });
    assert.equal(pendingCheckout.ok, true);
    if (!pendingCheckout.ok) return;
    await cancelGatewayAttempt({
      publicToken: pendingCheckout.checkout.publicToken,
      restaurantId: restaurant.id,
    });
    const pendingCash = await recordOrderPayment({
      orderId: pendingOrder.id,
      amount: 95,
      method: "CASH",
      capture: true,
    });
    assert.equal(pendingCash.ok, true);
    fake.setRefundMode("pending");
    const pendingId = `pay_late_pending_${suffix}`;
    fake.addPayment({
      id: pendingId,
      order_id: pendingCheckout.checkout.orderId!,
      amount: pendingCheckout.checkout.amountPaise,
      currency: "INR",
      status: "captured",
    });
    const pendingLate = await settleRazorpayCapture({
      restaurantId: restaurant.id,
      providerOrderId: pendingCheckout.checkout.orderId!,
      providerPaymentId: pendingId,
      amountPaise: pendingCheckout.checkout.amountPaise,
    });
    assert.equal(pendingLate.ok, false);
    assert.doesNotMatch(pendingLate.error, /was refunded/);
    const pendingRow = await prisma.gatewayPaymentAttempt.findUnique({
      where: { publicToken: pendingCheckout.checkout.publicToken },
    });
    assert.equal(pendingRow?.status, "REFUND_PENDING");
    fake.setRefundMode("processed");
  });

  it("uses the official Razorpay refund contract and request-scoped idempotency", async () => {
    const suffix = `rzp-ref-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix, { razorpay: true });
    const order = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 500,
    });
    const created = await createOrReuseRazorpayCheckout({
      restaurantId: restaurant.id,
      orderId: order.id,
      tableId: table.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const paymentId = `pay_rzpref_${suffix}`;
    fake.addPayment({
      id: paymentId,
      order_id: created.checkout.orderId!,
      amount: created.checkout.amountPaise,
      currency: "INR",
      status: "captured",
    });
    const settled = await settleRazorpayCapture({
      restaurantId: restaurant.id,
      providerOrderId: created.checkout.orderId!,
      providerPaymentId: paymentId,
      amountPaise: created.checkout.amountPaise,
    });
    assert.equal(settled.ok, true);
    if (!settled.ok || !settled.payment) return;

    const requestsBefore = fake.refundRequests.length;
    const refundsBefore = fake.refunds.size;
    const requestA = `tabletap-refund-${crypto.randomUUID()}`;
    fake.failNextRefund("network");
    const interrupted = await refundAutomaticPayment({
      paymentId: settled.payment.id,
      restaurantId: restaurant.id,
      amount: 100,
      requestId: requestA,
    });
    assert.equal(interrupted.ok, false);
    fake.failNextRefund("conflict");
    const inProgress = await refundAutomaticPayment({
      paymentId: settled.payment.id,
      restaurantId: restaurant.id,
      amount: 100,
      requestId: requestA,
    });
    assert.equal(inProgress.ok, false);
    assert.equal(inProgress.status, 503);
    assert.equal(fake.refunds.size, refundsBefore);
    const retried = await refundAutomaticPayment({
      paymentId: settled.payment.id,
      restaurantId: restaurant.id,
      amount: 100,
      requestId: requestA,
    });
    assert.equal(retried.ok, true);

    const requestB = `tabletap-refund-${crypto.randomUUID()}`;
    const second = await refundAutomaticPayment({
      paymentId: settled.payment.id,
      restaurantId: restaurant.id,
      amount: 100,
      requestId: requestB,
    });
    assert.equal(second.ok, true);
    if (second.ok && retried.ok) {
      assert.notEqual(second.payment.id, retried.payment.id);
    }
    const sameKeyAgain = await refundAutomaticPayment({
      paymentId: settled.payment.id,
      restaurantId: restaurant.id,
      amount: 100,
      requestId: requestA,
    });
    assert.equal(sameKeyAgain.ok, true);
    if (sameKeyAgain.ok && retried.ok) {
      assert.equal(sameKeyAgain.payment.id, retried.payment.id);
    }

    const over = await refundAutomaticPayment({
      paymentId: settled.payment.id,
      restaurantId: restaurant.id,
      amount: 400,
      requestId: `tabletap-refund-${crypto.randomUUID()}`,
    });
    assert.equal(over.ok, false);

    const newRequests = fake.refundRequests.slice(requestsBefore);
    assert.ok(newRequests.length >= 2);
    for (const req of newRequests) {
      assert.equal(req.path, `/payments/${paymentId}/refund`);
      assert.ok(req.refundIdempotencyKey);
      assert.equal(isValidRazorpayRefundIdempotencyKey(req.refundIdempotencyKey!), true);
      assert.ok(!req.refundIdempotencyKey!.includes(":"));
      assert.equal(req.genericIdempotencyKey, undefined);
    }
    assert.equal(newRequests[0]?.refundIdempotencyKey, requestA);
    assert.equal(RAZORPAY_REFUND_IDEMPOTENCY_HEADER, "X-Refund-Idempotency");
    assert.equal(fake.refunds.size, refundsBefore + 2);

    fake.setRefundMode("failed");
    const failed = await refundAutomaticPayment({
      paymentId: settled.payment.id,
      restaurantId: restaurant.id,
      amount: 50,
      requestId: `tabletap-refund-${crypto.randomUUID()}`,
    });
    assert.equal(failed.ok, false);
    fake.setRefundMode("pending");
    const pending = await refundAutomaticPayment({
      paymentId: settled.payment.id,
      restaurantId: restaurant.id,
      amount: 50,
      requestId: `tabletap-refund-${crypto.randomUUID()}`,
    });
    assert.equal(pending.ok, false);
    assert.equal("pending" in pending && pending.pending, true);
    const localRefunds = await prisma.payment.findMany({
      where: { restaurantId: restaurant.id, refundOfPaymentId: settled.payment.id },
    });
    assert.equal(localRefunds.length, 2);
    assert.equal(localRefunds.reduce((sum, row) => sum + row.amount, 0), 200);
    fake.setRefundMode("processed");

    const invalid = await refundAutomaticPayment({
      paymentId: settled.payment.id,
      restaurantId: restaurant.id,
      amount: 10,
      requestId: "refund:pay:1000",
    });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.status, 400);
  });

  it("requires a client requestId for Razorpay refunds and isolates retries from later actions", async () => {
    const suffix = `reqid-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix, { razorpay: true });
    const order = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 500,
    });
    const created = await createOrReuseRazorpayCheckout({
      restaurantId: restaurant.id,
      orderId: order.id,
      tableId: table.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const paymentId = `pay_reqid_${suffix}`;
    fake.addPayment({
      id: paymentId,
      order_id: created.checkout.orderId!,
      amount: created.checkout.amountPaise,
      currency: "INR",
      status: "captured",
    });
    const settled = await settleRazorpayCapture({
      restaurantId: restaurant.id,
      providerOrderId: created.checkout.orderId!,
      providerPaymentId: paymentId,
      amountPaise: created.checkout.amountPaise,
    });
    assert.equal(settled.ok, true);
    if (!settled.ok || !settled.payment) return;

    const refundsBefore = fake.refunds.size;
    const requestsBefore = fake.refundRequests.length;
    const missing = await refundAutomaticPayment({
      paymentId: settled.payment.id,
      restaurantId: restaurant.id,
      amount: 100,
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.status, 400);
    assert.equal(fake.refunds.size, refundsBefore);
    assert.equal(fake.refundRequests.length, requestsBefore);
    assert.equal(
      await prisma.gatewayRefundAttempt.count({ where: { restaurantId: restaurant.id } }),
      0,
    );
    assert.equal(
      await prisma.payment.count({
        where: { restaurantId: restaurant.id, refundOfPaymentId: settled.payment.id },
      }),
      0,
    );

    const requestA = `tabletap-refund-${crypto.randomUUID()}`;
    fake.failNextRefund("network");
    const interrupted = await refundAutomaticPayment({
      paymentId: settled.payment.id,
      restaurantId: restaurant.id,
      amount: 100,
      requestId: requestA,
    });
    assert.equal(interrupted.ok, false);
    const retried = await refundAutomaticPayment({
      paymentId: settled.payment.id,
      restaurantId: restaurant.id,
      amount: 100,
      requestId: requestA,
    });
    assert.equal(retried.ok, true);
    const requestB = `tabletap-refund-${crypto.randomUUID()}`;
    const second = await refundAutomaticPayment({
      paymentId: settled.payment.id,
      restaurantId: restaurant.id,
      amount: 100,
      requestId: requestB,
    });
    assert.equal(second.ok, true);
    if (retried.ok && second.ok) {
      assert.notEqual(retried.payment.id, second.payment.id);
    }
    assert.equal(fake.refunds.size, refundsBefore + 2);
    const localRefunds = await prisma.payment.findMany({
      where: { restaurantId: restaurant.id, refundOfPaymentId: settled.payment.id },
    });
    assert.equal(localRefunds.length, 2);
    assert.equal(localRefunds.reduce((sum, row) => sum + row.amount, 0), 200);
    const usedKeys = fake.refundRequests.slice(requestsBefore).map((row) => row.refundIdempotencyKey);
    assert.ok(usedKeys.includes(requestA));
    assert.ok(usedKeys.includes(requestB));
    assert.equal(usedKeys.filter((key) => key === requestA).length >= 1, true);
  });

  it("requires a restaurant host for public receipt and gateway tokens", async () => {
    const suffix = `host-${Date.now()}`;
    const owner = await seedRestaurant(`${suffix}-abc`, { razorpay: true });
    const other = await seedRestaurant(`${suffix}-xyz`, { razorpay: true });
    const order = await seedServedOrder({
      restaurantId: owner.restaurant.id,
      tableId: owner.table.id,
      menuItemId: owner.menuItem.id,
      orderNumber: 1,
      unitPrice: 88,
    });
    const created = await createOrReuseRazorpayCheckout({
      restaurantId: owner.restaurant.id,
      orderId: order.id,
      tableId: owner.table.id,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const paymentId = `pay_host_${suffix}`;
    fake.addPayment({
      id: paymentId,
      order_id: created.checkout.orderId!,
      amount: created.checkout.amountPaise,
      currency: "INR",
      status: "captured",
    });
    const settled = await settleRazorpayCapture({
      restaurantId: owner.restaurant.id,
      providerOrderId: created.checkout.orderId!,
      providerPaymentId: paymentId,
      amountPaise: created.checkout.amountPaise,
    });
    assert.equal(settled.ok, true);
    const bill = await prisma.bill.findFirst({ where: { orderId: order.id } });
    assert.ok(bill?.publicToken);

    const ownReceipt = await getPublicReceiptByToken({
      token: bill.publicToken!,
      hostRestaurantId: owner.restaurant.id,
      requireRestaurant: true,
    });
    assert.ok(ownReceipt);
    const otherReceipt = await getPublicReceiptByToken({
      token: bill.publicToken!,
      hostRestaurantId: other.restaurant.id,
      requireRestaurant: true,
    });
    assert.equal(otherReceipt, null);
    const reservedReceipt = await getPublicReceiptByToken({
      token: bill.publicToken!,
      hostRestaurantId: null,
      requireRestaurant: true,
    });
    assert.equal(reservedReceipt, null);

    const ownStatus = await getGatewayAttemptPublicStatus(
      created.checkout.publicToken,
      owner.restaurant.id,
      true,
    );
    assert.ok(ownStatus);
    assert.equal(
      await getGatewayAttemptPublicStatus(created.checkout.publicToken, other.restaurant.id, true),
      null,
    );
    assert.equal(await getGatewayAttemptPublicStatus(created.checkout.publicToken, null, true), null);

    const foreignCancel = await cancelGatewayAttempt({
      publicToken: created.checkout.publicToken,
      restaurantId: other.restaurant.id,
      requireRestaurant: true,
    });
    assert.equal(foreignCancel.ok, false);
    assert.equal(foreignCancel.status, 404);
    const reservedCancel = await cancelGatewayAttempt({
      publicToken: created.checkout.publicToken,
      requireRestaurant: true,
    });
    assert.equal(reservedCancel.ok, false);
    assert.equal(reservedCancel.status, 404);

    const foreignVerify = await verifyRazorpayCheckoutCallback({
      publicToken: created.checkout.publicToken,
      restaurantId: other.restaurant.id,
      requireRestaurant: true,
      razorpayPaymentId: paymentId,
      razorpaySignature: checkoutSignature(created.checkout.orderId!, paymentId),
    });
    assert.equal(foreignVerify.ok, false);
    assert.equal(foreignVerify.status, 404);

    const abcHost = classifyHostname("abc.dvadtech.in", {
      baseDomain: "dvadtech.in",
      nodeEnv: "production",
    });
    const xyzHost = classifyHostname("xyz.dvadtech.in", {
      baseDomain: "dvadtech.in",
      nodeEnv: "production",
    });
    const apex = classifyHostname("dvadtech.in", {
      baseDomain: "dvadtech.in",
      nodeEnv: "production",
    });
    const unknown = classifyHostname("unknown.dvadtech.in", {
      baseDomain: "dvadtech.in",
      nodeEnv: "production",
    });
    const localhost = classifyHostname("localhost:3000", { nodeEnv: "development" });
    assert.equal(abcHost.kind, "restaurant");
    assert.equal(xyzHost.kind, "restaurant");
    assert.equal(apex.kind, "reserved");
    assert.equal(localhost.kind, "reserved");
    if (abcHost.kind !== "restaurant" || xyzHost.kind !== "restaurant" || apex.kind !== "reserved" || localhost.kind !== "reserved") {
      return;
    }
    const abcScope = publicCustomerHostScope(
      {
        ok: true,
        kind: "restaurant",
        host: abcHost,
        context: {
          tenantId: "t-abc",
          restaurantId: owner.restaurant.id,
          restaurantName: "ABC",
          restaurantSlug: "abc",
          branchId: null,
          floorId: null,
        },
      } satisfies HostTenantResolution,
      "production",
    );
    const xyzScope = publicCustomerHostScope(
      {
        ok: true,
        kind: "restaurant",
        host: xyzHost,
        context: {
          tenantId: "t-xyz",
          restaurantId: other.restaurant.id,
          restaurantName: "XYZ",
          restaurantSlug: "xyz",
          branchId: null,
          floorId: null,
        },
      } satisfies HostTenantResolution,
      "production",
    );
    assert.deepEqual(abcScope, {
      ok: true,
      restaurantId: owner.restaurant.id,
      requireRestaurant: true,
    });
    assert.deepEqual(xyzScope, {
      ok: true,
      restaurantId: other.restaurant.id,
      requireRestaurant: true,
    });
    assert.equal(
      publicCustomerHostScope({ ok: true, kind: "reserved", host: apex }, "production").ok,
      false,
    );
    assert.equal(
      publicCustomerHostScope(
        {
          ok: true,
          kind: "tenant",
          host: abcHost.kind === "restaurant" ? abcHost : abcHost,
          tenant: { tenantId: "hub", tenantName: "Hub", tenantSlug: "tenant-hub" },
        } satisfies HostTenantResolution,
        "production",
      ).ok,
      false,
    );
    assert.equal(
      publicCustomerHostScope(
        {
          ok: false,
          kind: "unknown",
          reason: "UNKNOWN_SUBDOMAIN",
          status: 404,
          host: unknown,
        },
        "production",
      ).ok,
      false,
    );
    assert.deepEqual(
      publicCustomerHostScope({ ok: true, kind: "reserved", host: localhost }, "development"),
      { ok: true, restaurantId: null, requireRestaurant: false },
    );
  });

  it("never reassigns a Razorpay providerPaymentId to a different order", async () => {
    const suffix = `reassign-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix, { razorpay: true });
    const first = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 70,
    });
    const createdFirst = await createOrReuseRazorpayCheckout({
      restaurantId: restaurant.id,
      orderId: first.id,
      tableId: table.id,
    });
    assert.equal(createdFirst.ok, true);
    if (!createdFirst.ok) return;
    const paymentId = `pay_reassign_${suffix}`;
    fake.addPayment({
      id: paymentId,
      order_id: createdFirst.checkout.orderId!,
      amount: createdFirst.checkout.amountPaise,
      currency: "INR",
      status: "captured",
    });
    const settled = await settleRazorpayCapture({
      restaurantId: restaurant.id,
      providerOrderId: createdFirst.checkout.orderId!,
      providerPaymentId: paymentId,
      amountPaise: createdFirst.checkout.amountPaise,
    });
    assert.equal(settled.ok, true);
    const otherTable = await prisma.table.create({
      data: { number: 11, restaurantId: restaurant.id, qrToken: `qr-reassign-${suffix}` },
    });
    const second = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: otherTable.id,
      menuItemId: menuItem.id,
      orderNumber: 2,
      unitPrice: 70,
    });
    const createdSecond = await createOrReuseRazorpayCheckout({
      restaurantId: restaurant.id,
      orderId: second.id,
      tableId: otherTable.id,
    });
    assert.equal(createdSecond.ok, true);
    if (!createdSecond.ok) return;
    fake.addPayment({
      id: paymentId,
      order_id: createdSecond.checkout.orderId!,
      amount: createdSecond.checkout.amountPaise,
      currency: "INR",
      status: "captured",
    });
    const reassigned = await settleRazorpayCapture({
      restaurantId: restaurant.id,
      providerOrderId: createdSecond.checkout.orderId!,
      providerPaymentId: paymentId,
      amountPaise: createdSecond.checkout.amountPaise,
    });
    assert.equal(reassigned.ok, false);
    assert.match(reassigned.error, /another order/);
    assert.equal(
      await prisma.payment.count({
        where: { restaurantId: restaurant.id, providerPaymentId: paymentId },
      }),
      1,
    );
    const original = await prisma.payment.findFirst({
      where: { restaurantId: restaurant.id, providerPaymentId: paymentId },
    });
    assert.equal(original?.orderId, first.id);
  });

  it("allows only OWNER to mutate gateway credentials", () => {
    assert.equal(canMutatePaymentGatewayCredentials("OWNER"), true);
    assert.equal(canMutatePaymentGatewayCredentials("MANAGER"), false);
    assert.equal(canMutatePaymentGatewayCredentials("SERVER"), false);
    assert.equal(canMutatePaymentGatewayCredentials("COOK"), false);
  });
});

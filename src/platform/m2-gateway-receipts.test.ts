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

const dbPath = path.join(os.tmpdir(), `tabletap-m2-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_URL = `file:${dbPath}`;
process.env.JWT_SECRET = process.env.JWT_SECRET || "m2-test-jwt-secret-must-be-32-chars!!";

let prisma: PrismaClient;
let createOrReuseRazorpayCheckout: typeof import("@/lib/gateway-payment-service").createOrReuseRazorpayCheckout;
let verifyRazorpayCheckoutCallback: typeof import("@/lib/gateway-payment-service").verifyRazorpayCheckoutCallback;
let settleRazorpayCapture: typeof import("@/lib/gateway-payment-service").settleRazorpayCapture;
let refundAutomaticPayment: typeof import("@/lib/gateway-payment-service").refundAutomaticPayment;
let getGatewayAttemptPublicStatus: typeof import("@/lib/gateway-payment-service").getGatewayAttemptPublicStatus;
let recordOrderPayment: typeof import("@/lib/payment-allocation-service").recordOrderPayment;
let initiateManualUpiPayment: typeof import("@/lib/payment-allocation-service").initiateManualUpiPayment;
let getOrderPaymentSummary: typeof import("@/lib/payment-allocation-service").getOrderPaymentSummary;
let processPaymentWebhook: typeof import("@/lib/payment-webhook-service").processPaymentWebhook;
let getPaymentGatewaySettings: typeof import("@/lib/payment-webhook-service").getPaymentGatewaySettings;
let updatePaymentGatewaySettings: typeof import("@/lib/payment-webhook-service").updatePaymentGatewaySettings;
let getPublicReceiptByToken: typeof import("@/lib/public-receipt-service").getPublicReceiptByToken;
let voidOrderBill: typeof import("@/lib/bill-service").voidOrderBill;
let setRazorpayTransportForTests: typeof import("@/lib/razorpay-client").setRazorpayTransportForTests;
let invalidateFeatureCache: typeof import("@/lib/feature-flags").invalidateFeatureCache;

type FakeOrder = { id: string; amount: number; currency: string; receipt?: string; status: string };
type FakePayment = { id: string; order_id: string; amount: number; currency: string; status: string };
type FakeRefund = { id: string; payment_id: string; amount: number; status: string };

function createFakeRazorpay() {
  const orders = new Map<string, FakeOrder>();
  const payments = new Map<string, FakePayment>();
  const refunds = new Map<string, FakeRefund>();
  const refundKeys = new Map<string, FakeRefund>();
  let createCalls = 0;
  let failNextCreate: "retryable" | "permanent" | null = null;
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
    if (req.method === "GET" && req.path.startsWith("/payments/")) {
      const id = decodeURIComponent(req.path.slice("/payments/".length));
      const payment = payments.get(id);
      if (!payment) return { status: 404, json: { error: { description: "not found" } }, retryable: false };
      return { status: 200, json: payment, retryable: false };
    }
    if (req.method === "POST" && req.path.includes("/refunds")) {
      const paymentId = decodeURIComponent(req.path.split("/")[2] ?? "");
      if (req.idempotencyKey && refundKeys.has(req.idempotencyKey)) {
        return { status: 200, json: refundKeys.get(req.idempotencyKey), retryable: false };
      }
      if (refundMode === "failed") {
        return { status: 400, json: { error: { description: "refund failed" } }, retryable: false };
      }
      const body = req.body as { amount: number };
      const refund = {
        id: `rfnd_${refunds.size + 1}`,
        payment_id: paymentId,
        amount: body.amount,
        status: refundMode === "pending" ? "pending" : "processed",
      };
      refunds.set(refund.id, refund);
      if (req.idempotencyKey) refundKeys.set(req.idempotencyKey, refund);
      return { status: 200, json: refund, retryable: false };
    }
    return { status: 404, json: null, retryable: false };
  };

  return {
    transport,
    orders,
    payments,
    refunds,
    createCalls: () => createCalls,
    failNextCreate(kind: "retryable" | "permanent") {
      failNextCreate = kind;
    },
    setRefundMode(mode: "processed" | "failed" | "pending") {
      refundMode = mode;
    },
    addPayment(payment: FakePayment) {
      payments.set(payment.id, payment);
    },
  };
}

let fake = createFakeRazorpay();

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
  } = await import("@/lib/gateway-payment-service"));
  ({ recordOrderPayment, initiateManualUpiPayment, getOrderPaymentSummary } = await import(
    "@/lib/payment-allocation-service"
  ));
  ({ processPaymentWebhook, getPaymentGatewaySettings, updatePaymentGatewaySettings } = await import(
    "@/lib/payment-webhook-service"
  ));
  ({ getPublicReceiptByToken } = await import("@/lib/public-receipt-service"));
  ({ voidOrderBill } = await import("@/lib/bill-service"));
  ({ setRazorpayTransportForTests } = await import("@/lib/razorpay-client"));
  ({ invalidateFeatureCache } = await import("@/lib/feature-flags"));
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

    const first = await refundAutomaticPayment({
      paymentId: settled.payment.id,
      restaurantId: restaurant.id,
      amount: 50,
    });
    assert.equal(first.ok, true);
    const retry = await refundAutomaticPayment({
      paymentId: settled.payment.id,
      restaurantId: restaurant.id,
      amount: 50,
    });
    assert.equal(retry.ok, true);
    if (retry.ok && first.ok) {
      assert.equal(retry.payment.id, first.payment.id);
    }
    const over = await refundAutomaticPayment({
      paymentId: settled.payment.id,
      restaurantId: restaurant.id,
      amount: 200,
    });
    assert.equal(over.ok, false);

    fake.setRefundMode("failed");
    const failed = await refundAutomaticPayment({
      paymentId: settled.payment.id,
      restaurantId: restaurant.id,
      amount: 25,
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
});

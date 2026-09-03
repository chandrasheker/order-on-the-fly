import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import Database from "better-sqlite3";
import type { PrismaClient } from "@/generated/prisma/client";
import { computeOrderFinancials } from "@/lib/order-financials";
import { todayDateString } from "@/lib/utils";

const dbPath = path.join(os.tmpdir(), `tabletap-m1-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_URL = `file:${dbPath}`;

let prisma: PrismaClient;
let recordOrderPayment: typeof import("@/lib/payment-allocation-service").recordOrderPayment;
let recordFullOrderPayment: typeof import("@/lib/payment-allocation-service").recordFullOrderPayment;
let initiateManualUpiPayment: typeof import("@/lib/payment-allocation-service").initiateManualUpiPayment;
let confirmManualUpiPayment: typeof import("@/lib/payment-allocation-service").confirmManualUpiPayment;
let rejectManualUpiPayment: typeof import("@/lib/payment-allocation-service").rejectManualUpiPayment;
let refundCapturedPayment: typeof import("@/lib/payment-allocation-service").refundCapturedPayment;
let getOrderPaymentSummary: typeof import("@/lib/payment-allocation-service").getOrderPaymentSummary;
let processPaymentWebhook: typeof import("@/lib/payment-webhook-service").processPaymentWebhook;
let runDailyReconciliation: typeof import("@/domains/payments/reconciliation-service").runDailyReconciliation;
let invalidateFeatureCache: typeof import("@/lib/feature-flags").invalidateFeatureCache;

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
    recordOrderPayment,
    recordFullOrderPayment,
    initiateManualUpiPayment,
    confirmManualUpiPayment,
    rejectManualUpiPayment,
    refundCapturedPayment,
    getOrderPaymentSummary,
  } = await import("@/lib/payment-allocation-service"));
  ({ processPaymentWebhook } = await import("@/lib/payment-webhook-service"));
  ({ runDailyReconciliation } = await import("@/domains/payments/reconciliation-service"));
  ({ invalidateFeatureCache } = await import("@/lib/feature-flags"));
});

after(async () => {
  if (prisma) await prisma.$disconnect().catch(() => undefined);
  for (const extra of ["", "-wal", "-shm", "-journal"]) {
    fs.rmSync(`${dbPath}${extra}`, { force: true });
  }
});

async function seedRestaurant(suffix: string, extras?: { gst?: boolean; webhook?: boolean }) {
  const restaurant = await prisma.restaurant.create({
    data: {
      name: `R ${suffix}`,
      nameNormalized: `r ${suffix}`,
      slug: `r-${suffix}`,
      receiptGstEnabled: Boolean(extras?.gst),
      receiptGstRate: 5,
      paymentGatewayProvider: extras?.webhook ? "RAZORPAY" : null,
      paymentWebhookSecret: extras?.webhook ? "whsec_test" : null,
      featureFlags: extras?.webhook ? JSON.stringify({ payment_webhooks: true }) : "{}",
    },
  });
  if (extras?.webhook) invalidateFeatureCache(restaurant.id);
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
  status?: "SERVED" | "PENDING";
}) {
  const order = await prisma.order.create({
    data: {
      orderNumber: params.orderNumber,
      restaurantId: params.restaurantId,
      tableId: params.tableId,
      status: params.status ?? "SERVED",
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

function signedRazorpay(body: Record<string, unknown>, secret: string) {
  const rawBody = JSON.stringify(body);
  const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return {
    rawBody,
    headers: new Headers({ "x-razorpay-signature": signature }),
  };
}

describe("M1 financial correctness", () => {
  it("GST/discount customer UPI amount equals canonical backend due", async () => {
    const suffix = `gst-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix, { gst: true });
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
    const summary = await getOrderPaymentSummary(order.id);
    assert.equal(summary?.remaining, financials.amountDue);
    assert.notEqual(summary?.remaining, 200);
    const initiated = await initiateManualUpiPayment({ orderId: order.id, tableId: table.id });
    assert.equal(initiated.ok, true);
    if (!initiated.ok) return;
    assert.equal(initiated.payment?.amount, financials.amountDue);
  });

  it("blocks multi-order table UPI against a single anchor order", async () => {
    const suffix = `tab-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix);
    const first = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 100,
    });
    await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 2,
      unitPrice: 150,
    });
    const result = await initiateManualUpiPayment({ orderId: first.id, tableId: table.id });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /table bill/i);
    const pending = await prisma.payment.count({ where: { tableId: table.id } });
    assert.equal(pending, 0);
  });

  it("allows a fresh manual UPI attempt after reject", async () => {
    const suffix = `retry-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix);
    const order = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 120,
    });
    const first = await initiateManualUpiPayment({ orderId: order.id });
    assert.equal(first.ok, true);
    if (!first.ok || !first.payment) return;
    const rejected = await rejectManualUpiPayment({
      paymentId: first.payment.id,
      restaurantId: restaurant.id,
    });
    assert.equal(rejected.ok, true);
    const second = await initiateManualUpiPayment({ orderId: order.id });
    assert.equal(second.ok, true);
    if (!second.ok || !second.payment) return;
    assert.notEqual(second.payment.id, first.payment.id);
    assert.equal(second.payment.status, "PENDING");
    assert.equal(first.payment.status === "FAILED" || rejected.ok, true);
  });

  it("concurrent initiateManualUpiPayment creates exactly one active pending row", async () => {
    const suffix = `init-race-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix);
    const order = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 180,
    });
    const [first, second] = await Promise.all([
      initiateManualUpiPayment({ orderId: order.id }),
      initiateManualUpiPayment({ orderId: order.id }),
    ]);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !first.payment || !second.ok || !second.payment) return;
    assert.equal(first.payment.id, second.payment.id);
    assert.ok(first.payment.status === "PENDING" || first.payment.status === "INITIATED");
    assert.ok(second.payment.status === "PENDING" || second.payment.status === "INITIATED");
    const pending = await prisma.payment.findMany({
      where: {
        orderId: order.id,
        method: "MANUAL_UPI",
        status: { in: ["PENDING", "INITIATED"] },
      },
    });
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.id, first.payment.id);
    assert.equal(pending[0]?.amount, 180);
  });

  it("confirm cancels sibling pending UPI and captured total cannot exceed the bill", async () => {
    const suffix = `sib-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix);
    const order = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 220,
    });
    const pending = await initiateManualUpiPayment({ orderId: order.id });
    assert.equal(pending.ok, true);
    if (!pending.ok || !pending.payment) return;
    const sibling = await prisma.payment.create({
      data: {
        restaurantId: restaurant.id,
        tableId: table.id,
        orderId: order.id,
        amount: 220,
        method: "MANUAL_UPI",
        status: "PENDING",
        verificationStatus: "PENDING_VERIFICATION",
        idempotencyKey: `manual-upi-sibling:${order.id}`,
        note: "raced sibling",
      },
    });
    const confirmed = await confirmManualUpiPayment({
      paymentId: pending.payment.id,
      restaurantId: restaurant.id,
    });
    assert.equal(confirmed.ok, true);
    const replay = await confirmManualUpiPayment({
      paymentId: pending.payment.id,
      restaurantId: restaurant.id,
    });
    assert.equal(replay.ok, true);
    const leftover = await prisma.payment.findMany({
      where: {
        orderId: order.id,
        method: "MANUAL_UPI",
        status: { in: ["PENDING", "INITIATED"] },
      },
    });
    assert.equal(leftover.length, 0);
    const siblingRow = await prisma.payment.findUnique({ where: { id: sibling.id } });
    assert.equal(siblingRow?.status, "CANCELLED");
    const captured = await prisma.payment.findMany({
      where: { orderId: order.id, status: "CAPTURED" },
    });
    const capturedTotal = captured.reduce((sum, row) => sum + row.amount, 0);
    assert.equal(captured.length, 1);
    assert.equal(capturedTotal, 220);
    const summary = await getOrderPaymentSummary(order.id);
    assert.equal(summary?.remaining, 0);
    assert.ok((summary?.paid ?? 0) <= 220.01);
  });

  it("staff full payment cancels pending UPI so verify cannot double-capture", async () => {
    const suffix = `race-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix);
    const order = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 300,
    });
    const pending = await initiateManualUpiPayment({ orderId: order.id });
    assert.equal(pending.ok, true);
    if (!pending.ok || !pending.payment) return;
    const paid = await recordFullOrderPayment({ orderId: order.id, method: "CASH" });
    assert.equal(paid.ok, true);
    const confirm = await confirmManualUpiPayment({
      paymentId: pending.payment.id,
      restaurantId: restaurant.id,
    });
    assert.equal(confirm.ok, false);
    const captured = await prisma.payment.findMany({
      where: { orderId: order.id, status: "CAPTURED" },
    });
    assert.equal(captured.length, 1);
    assert.equal(captured[0]?.amount, 300);
    const leftover = await prisma.payment.findUnique({ where: { id: pending.payment.id } });
    assert.equal(leftover?.status, "CANCELLED");
  });

  it("concurrent staff pay and verify cannot over-capture", async () => {
    const suffix = `comp-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix);
    const order = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 400,
    });
    const pending = await initiateManualUpiPayment({ orderId: order.id });
    assert.equal(pending.ok, true);
    if (!pending.ok || !pending.payment) return;
    await Promise.all([
      recordFullOrderPayment({ orderId: order.id, method: "CASH" }),
      confirmManualUpiPayment({
        paymentId: pending.payment.id,
        restaurantId: restaurant.id,
      }),
    ]);
    const captured = await prisma.payment.findMany({
      where: { orderId: order.id, status: "CAPTURED" },
    });
    const capturedTotal = captured.reduce((sum, row) => sum + row.amount, 0);
    assert.ok(capturedTotal <= 400.01);
    assert.ok(captured.length >= 1);
    const summary = await getOrderPaymentSummary(order.id);
    assert.equal(summary?.remaining, 0);
  });

  it("failed webhook replay captures exactly once", async () => {
    const suffix = `wh-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix, { webhook: true });
    const order = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 250,
      status: "PENDING",
    });
    const payload = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_${suffix}`,
            amount: 25000,
            notes: { orderId: order.id, tableId: table.id },
          },
        },
      },
    };
    const first = signedRazorpay(payload, "whsec_test");
    const failed = await processPaymentWebhook({
      slug: restaurant.slug,
      provider: "razorpay",
      rawBody: first.rawBody,
      headers: first.headers,
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.status, 503);
    const event = await prisma.paymentWebhookEvent.findUnique({
      where: {
        restaurantId_provider_externalId: {
          restaurantId: restaurant.id,
          provider: "razorpay",
          externalId: `pay_${suffix}`,
        },
      },
    });
    assert.equal(event?.processedAt, null);
    await prisma.order.update({ where: { id: order.id }, data: { status: "SERVED" } });
    const replay = signedRazorpay(payload, "whsec_test");
    const ok = await processPaymentWebhook({
      slug: restaurant.slug,
      provider: "razorpay",
      rawBody: replay.rawBody,
      headers: replay.headers,
    });
    assert.equal(ok.ok, true);
    const again = signedRazorpay(payload, "whsec_test");
    const idempotent = await processPaymentWebhook({
      slug: restaurant.slug,
      provider: "razorpay",
      rawBody: again.rawBody,
      headers: again.headers,
    });
    assert.equal(idempotent.ok, true);
    const payments = await prisma.payment.findMany({
      where: { orderId: order.id, status: "CAPTURED" },
    });
    assert.equal(payments.length, 1);
    const processed = await prisma.paymentWebhookEvent.findUnique({
      where: {
        restaurantId_provider_externalId: {
          restaurantId: restaurant.id,
          provider: "razorpay",
          externalId: `pay_${suffix}`,
        },
      },
    });
    assert.ok(processed?.processedAt);
  });

  it("multi-order automatic webhook never partially applies", async () => {
    const suffix = `split-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix, { webhook: true });
    await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 100,
    });
    await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 2,
      unitPrice: 150,
    });
    const payload = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_${suffix}`,
            amount: 25000,
            notes: { tableId: table.id },
          },
        },
      },
    };
    const signed = signedRazorpay(payload, "whsec_test");
    const result = await processPaymentWebhook({
      slug: restaurant.slug,
      provider: "razorpay",
      rawBody: signed.rawBody,
      headers: signed.headers,
    });
    assert.equal(result.ok, false);
    const payments = await prisma.payment.count({ where: { tableId: table.id } });
    assert.equal(payments, 0);
  });

  it("same provider externalId is isolated per restaurant", async () => {
    const suffix = `iso-${Date.now()}`;
    const a = await seedRestaurant(`${suffix}-a`, { webhook: true });
    const b = await seedRestaurant(`${suffix}-b`, { webhook: true });
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
    const externalId = `pay_shared_${suffix}`;
    const payloadA = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: externalId,
            amount: 10000,
            notes: { orderId: orderA.id, tableId: a.table.id },
          },
        },
      },
    };
    const payloadB = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: externalId,
            amount: 15000,
            notes: { orderId: orderB.id, tableId: b.table.id },
          },
        },
      },
    };
    const firstA = await processPaymentWebhook({
      slug: a.restaurant.slug,
      provider: "razorpay",
      ...signedRazorpay(payloadA, "whsec_test"),
    });
    const firstB = await processPaymentWebhook({
      slug: b.restaurant.slug,
      provider: "razorpay",
      ...signedRazorpay(payloadB, "whsec_test"),
    });
    assert.equal(firstA.ok, true);
    assert.equal(firstB.ok, true);

    const events = await prisma.paymentWebhookEvent.findMany({
      where: { provider: "razorpay", externalId },
    });
    assert.equal(events.length, 2);
    assert.equal(new Set(events.map((row) => row.restaurantId)).size, 2);
    assert.ok(events.every((row) => row.processedAt));

    const eventA = events.find((row) => row.restaurantId === a.restaurant.id);
    const eventB = events.find((row) => row.restaurantId === b.restaurant.id);
    assert.equal(eventA?.orderId, orderA.id);
    assert.equal(eventB?.orderId, orderB.id);
    assert.equal(eventA?.amount, 100);
    assert.equal(eventB?.amount, 150);

    const replayA = await processPaymentWebhook({
      slug: a.restaurant.slug,
      provider: "razorpay",
      ...signedRazorpay(payloadA, "whsec_test"),
    });
    const replayB = await processPaymentWebhook({
      slug: b.restaurant.slug,
      provider: "razorpay",
      ...signedRazorpay(payloadB, "whsec_test"),
    });
    assert.equal(replayA.ok, true);
    assert.equal(replayB.ok, true);

    const eventsAfter = await prisma.paymentWebhookEvent.findMany({
      where: { provider: "razorpay", externalId },
    });
    assert.equal(eventsAfter.length, 2);
    assert.equal(eventsAfter.find((row) => row.restaurantId === a.restaurant.id)?.id, eventA?.id);
    assert.equal(eventsAfter.find((row) => row.restaurantId === b.restaurant.id)?.id, eventB?.id);

    const paymentsA = await prisma.payment.findMany({
      where: { restaurantId: a.restaurant.id, status: "CAPTURED" },
    });
    const paymentsB = await prisma.payment.findMany({
      where: { restaurantId: b.restaurant.id, status: "CAPTURED" },
    });
    assert.equal(paymentsA.length, 1);
    assert.equal(paymentsB.length, 1);
    assert.equal(paymentsA[0]?.orderId, orderA.id);
    assert.equal(paymentsB[0]?.orderId, orderB.id);
    assert.equal(paymentsA[0]?.amount, 100);
    assert.equal(paymentsB[0]?.amount, 150);
    assert.equal(paymentsA[0]?.providerPaymentId, externalId);
    assert.equal(paymentsB[0]?.providerPaymentId, externalId);

    const crossA = await prisma.payment.count({
      where: { restaurantId: a.restaurant.id, orderId: orderB.id },
    });
    const crossB = await prisma.payment.count({
      where: { restaurantId: b.restaurant.id, orderId: orderA.id },
    });
    assert.equal(crossA, 0);
    assert.equal(crossB, 0);
  });

  it("concurrent first payments get distinct bills and every capture has a billId", async () => {
    const suffix = `bills-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix);
    const orderA = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 80,
    });
    const orderB = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 2,
      unitPrice: 90,
    });
    const [a, b] = await Promise.all([
      recordOrderPayment({ orderId: orderA.id, amount: 80, method: "CASH" }),
      recordOrderPayment({ orderId: orderB.id, amount: 90, method: "CASH" }),
    ]);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    if (!a.ok || !b.ok) return;
    assert.ok(a.payment?.billId);
    assert.ok(b.payment?.billId);
    const bills = await prisma.bill.findMany({ where: { restaurantId: restaurant.id } });
    assert.equal(bills.length, 2);
    assert.notEqual(bills[0]?.billNumber, bills[1]?.billNumber);
  });

  it("allows two partial refunds and rejects cumulative over-refund", async () => {
    const suffix = `rf-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix);
    const order = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 1000,
    });
    const paid = await recordOrderPayment({ orderId: order.id, amount: 1000, method: "CASH" });
    assert.equal(paid.ok, true);
    if (!paid.ok || !paid.payment) return;
    const first = await refundCapturedPayment({
      paymentId: paid.payment.id,
      restaurantId: restaurant.id,
      amount: 300,
      idempotencyKey: `rf1-${suffix}`,
    });
    const second = await refundCapturedPayment({
      paymentId: paid.payment.id,
      restaurantId: restaurant.id,
      amount: 400,
      idempotencyKey: `rf2-${suffix}`,
    });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    const replay = await refundCapturedPayment({
      paymentId: paid.payment.id,
      restaurantId: restaurant.id,
      amount: 300,
      idempotencyKey: `rf1-${suffix}`,
    });
    assert.equal(replay.ok, true);
    if (replay.ok && first.ok) assert.equal(replay.payment.id, first.payment.id);
    const over = await refundCapturedPayment({
      paymentId: paid.payment.id,
      restaurantId: restaurant.id,
      amount: 400,
      idempotencyKey: `rf3-${suffix}`,
    });
    assert.equal(over.ok, false);
    const original = await prisma.payment.findUnique({ where: { id: paid.payment.id } });
    assert.equal(original?.amount, 1000);
    assert.equal(original?.status, "CAPTURED");
  });

  it("nets cash refunds out of cash expected", async () => {
    const suffix = `recon-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix);
    const order = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 1000,
    });
    const paid = await recordOrderPayment({ orderId: order.id, amount: 1000, method: "CASH" });
    assert.equal(paid.ok, true);
    if (!paid.ok || !paid.payment) return;
    await refundCapturedPayment({
      paymentId: paid.payment.id,
      restaurantId: restaurant.id,
      amount: 200,
      idempotencyKey: `cashrf-${suffix}`,
    });
    const row = await runDailyReconciliation(restaurant.id);
    assert.equal(row.cashExpected, 800);
    assert.equal(row.refundsTotal, 200);
  });
});

describe("fresh financial migration FK", () => {
  it("Payment.billId references Bill.id ON DELETE SET NULL", () => {
    const migrateDb = path.join(os.tmpdir(), `tabletap-fk-${process.pid}-${Date.now()}.db`);
    try {
      execFileSync(
        process.execPath,
        [
          path.join(process.cwd(), "scripts", "run-with-mem.js"),
          "npx",
          "prisma",
          "migrate",
          "deploy",
        ],
        {
          cwd: process.cwd(),
          env: { ...process.env, DATABASE_URL: `file:${migrateDb}` },
          stdio: "pipe",
        },
      );
      const db = new Database(migrateDb);
      const rows = db.prepare(`PRAGMA foreign_key_list('Payment')`).all() as Array<{
        table: string;
        from: string;
        to: string;
        on_delete: string;
      }>;
      db.close();
      const billFk = rows.find((row) => row.table === "Bill" && row.from === "billId");
      assert.ok(billFk, `expected Payment.billId FK, got ${JSON.stringify(rows)}`);
      assert.equal(billFk.to, "id");
      assert.equal(billFk.on_delete.toUpperCase(), "SET NULL");
    } finally {
      for (const extra of ["", "-wal", "-shm", "-journal"]) {
        fs.rmSync(`${migrateDb}${extra}`, { force: true });
      }
    }
  });
});

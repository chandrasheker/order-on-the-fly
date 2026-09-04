import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { NextRequest, NextResponse } from "next/server";
import type { PrismaClient } from "@/generated/prisma/client";
import { encryptSecret } from "@/lib/credential-crypto";
import { todayDateString } from "@/lib/utils";

const dbPath = path.join(os.tmpdir(), `tabletap-m4-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_URL = `file:${dbPath}`;
process.env.JWT_SECRET = process.env.JWT_SECRET || "m4-test-jwt-secret-must-be-32-chars!!";
process.env.PRINT_DELIVERY_MODE = "agent-pull";
process.env.TENANT_BASE_DOMAIN = "dvadtech.in";
delete process.env.PRINTER_AGENT_URL;
delete process.env.FORENSIC_TRUST_PROXY;

let prisma: PrismaClient;
let appendPlatformAuditEvent: typeof import("@/platform/forensics/platform-audit-service").appendPlatformAuditEvent;
let queryPlatformAuditEvents: typeof import("@/platform/forensics/platform-audit-service").queryPlatformAuditEvents;
let runWithForensicContext: typeof import("@/platform/forensics/request-context").runWithForensicContext;
let generateRequestId: typeof import("@/platform/forensics/request-context").generateRequestId;
let setForensicActor: typeof import("@/platform/forensics/request-context").setForensicActor;
let setForensicTenant: typeof import("@/platform/forensics/request-context").setForensicTenant;
let resolveClientIp: typeof import("@/platform/forensics/client-ip").resolveClientIp;
let redactSecrets: typeof import("@/platform/forensics/redactor").redactSecrets;
let formatOperationalLogLine: typeof import("@/lib/logger").formatOperationalLogLine;
let withForensicApiRoute: typeof import("@/platform/forensics/with-forensic-api-route").withForensicApiRoute;
let updateManagedMenuItemForRestaurant: typeof import("@/app/api/menu/manage/route").updateManagedMenuItemForRestaurant;
let applyStaffUserMutationInTx: typeof import("@/app/api/platform/users/route").applyStaffUserMutationInTx;
let hashPassword: typeof import("@/lib/auth").hashPassword;
let createPlatformAdminToken: typeof import("@/lib/auth").createPlatformAdminToken;
let createTenantAdminToken: typeof import("@/lib/auth").createTenantAdminToken;
let PLATFORM_ADMIN_COOKIE: typeof import("@/lib/auth").PLATFORM_ADMIN_COOKIE;
let TENANT_ADMIN_COOKIE: typeof import("@/lib/auth").TENANT_ADMIN_COOKIE;
let finalizeOrderBill: typeof import("@/lib/bill-service").finalizeOrderBill;
let recordOrderPayment: typeof import("@/lib/payment-allocation-service").recordOrderPayment;
let initiateManualUpiPayment: typeof import("@/lib/payment-allocation-service").initiateManualUpiPayment;
let confirmManualUpiPayment: typeof import("@/lib/payment-allocation-service").confirmManualUpiPayment;
let refundCapturedPayment: typeof import("@/lib/payment-allocation-service").refundCapturedPayment;
let updatePaymentGatewaySettings: typeof import("@/lib/payment-webhook-service").updatePaymentGatewaySettings;
let processPaymentWebhook: typeof import("@/lib/payment-webhook-service").processPaymentWebhook;
let invalidateFeatureCache: typeof import("@/lib/feature-flags").invalidateFeatureCache;
let createOrReuseRazorpayCheckout: typeof import("@/lib/gateway-payment-service").createOrReuseRazorpayCheckout;
let verifyRazorpayCheckoutCallback: typeof import("@/lib/gateway-payment-service").verifyRazorpayCheckoutCallback;
let setRazorpayTransportForTests: typeof import("@/lib/razorpay-client").setRazorpayTransportForTests;
let enqueueKitchenChitForOrder: typeof import("@/domains/printing/print-job-service").enqueueKitchenChitForOrder;
let claimNextPrintJob: typeof import("@/domains/printing/print-job-service").claimNextPrintJob;
let reportPrintJobResult: typeof import("@/domains/printing/print-job-service").reportPrintJobResult;
let retryPrintJobForRestaurant: typeof import("@/domains/printing/print-job-service").retryPrintJobForRestaurant;
let reprintPrintJobForRestaurant: typeof import("@/domains/printing/print-job-service").reprintPrintJobForRestaurant;
let recoverExpiredPrintLeases: typeof import("@/domains/printing/print-job-service").recoverExpiredPrintLeases;
let createPrinterAgent: typeof import("@/lib/printer-agent-service").createPrinterAgent;
let updatePrinterAgent: typeof import("@/lib/printer-agent-service").updatePrinterAgent;
let authenticatePrinterAgent: typeof import("@/lib/printer-agent-service").authenticatePrinterAgent;
let loadOrderByIdForRequest: typeof import("@/platform/tenant-scope").loadOrderByIdForRequest;
let auditGet: typeof import("@/app/api/platform/audit/route").GET;
let auditDelete: typeof import("@/app/api/platform/audit/route").DELETE;
let loginPost: typeof import("@/app/api/auth/login/route").POST;

type FakeOrder = { id: string; amount: number; currency: string; receipt?: string; status: string };
type FakePayment = { id: string; order_id: string; amount: number; currency: string; status: string };

function createFakeRazorpay() {
  const orders = new Map<string, FakeOrder>();
  const payments = new Map<string, FakePayment>();
  let createCalls = 0;
  const transport = async (req: { method: string; path: string; body?: unknown }) => {
    if (req.method === "POST" && req.path === "/orders") {
      createCalls += 1;
      const body = req.body as { amount: number; currency: string; receipt: string };
      const id = `order_${createCalls}_${body.receipt}`;
      const order = { id, amount: body.amount, currency: body.currency, receipt: body.receipt, status: "created" };
      orders.set(id, order);
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
    if (req.method === "POST" && /\/payments\/[^/]+\/refund$/.test(req.path)) {
      return { status: 200, json: { id: "rfnd_1", status: "processed", amount: 0 }, retryable: false };
    }
    return { status: 404, json: null, retryable: false };
  };
  return {
    transport,
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
  await prisma.$executeRawUnsafe(`
CREATE TRIGGER IF NOT EXISTS "platform_audit_event_no_update"
BEFORE UPDATE ON "PlatformAuditEvent"
BEGIN
    SELECT RAISE(ABORT, 'PlatformAuditEvent is append-only');
END;
`);
  await prisma.$executeRawUnsafe(`
CREATE TRIGGER IF NOT EXISTS "platform_audit_event_no_delete"
BEFORE DELETE ON "PlatformAuditEvent"
BEGIN
    SELECT RAISE(ABORT, 'PlatformAuditEvent is append-only');
END;
`);
  ({
    appendPlatformAuditEvent,
    queryPlatformAuditEvents,
  } = await import("@/platform/forensics/platform-audit-service"));
  ({ runWithForensicContext, generateRequestId, setForensicActor, setForensicTenant } = await import(
    "@/platform/forensics/request-context"
  ));
  ({ resolveClientIp } = await import("@/platform/forensics/client-ip"));
  ({ redactSecrets } = await import("@/platform/forensics/redactor"));
  ({ formatOperationalLogLine } = await import("@/lib/logger"));
  ({ withForensicApiRoute } = await import("@/platform/forensics/with-forensic-api-route"));
  ({ updateManagedMenuItemForRestaurant } = await import("@/app/api/menu/manage/route"));
  ({ applyStaffUserMutationInTx } = await import("@/app/api/platform/users/route"));
  ({
    hashPassword,
    createPlatformAdminToken,
    createTenantAdminToken,
    PLATFORM_ADMIN_COOKIE,
    TENANT_ADMIN_COOKIE,
  } = await import("@/lib/auth"));
  ({ finalizeOrderBill } = await import("@/lib/bill-service"));
  ({ recordOrderPayment, initiateManualUpiPayment, confirmManualUpiPayment, refundCapturedPayment } = await import(
    "@/lib/payment-allocation-service"
  ));
  ({ updatePaymentGatewaySettings, processPaymentWebhook } = await import("@/lib/payment-webhook-service"));
  ({ invalidateFeatureCache } = await import("@/lib/feature-flags"));
  ({ createOrReuseRazorpayCheckout, verifyRazorpayCheckoutCallback } = await import(
    "@/lib/gateway-payment-service"
  ));
  ({ setRazorpayTransportForTests } = await import("@/lib/razorpay-client"));
  ({
    enqueueKitchenChitForOrder,
    claimNextPrintJob,
    reportPrintJobResult,
    retryPrintJobForRestaurant,
    reprintPrintJobForRestaurant,
    recoverExpiredPrintLeases,
  } = await import("@/domains/printing/print-job-service"));
  ({ createPrinterAgent, updatePrinterAgent, authenticatePrinterAgent } = await import("@/lib/printer-agent-service"));
  ({ loadOrderByIdForRequest } = await import("@/platform/tenant-scope"));
  ({ GET: auditGet, DELETE: auditDelete } = await import("@/app/api/platform/audit/route"));
  ({ POST: loginPost } = await import("@/app/api/auth/login/route"));
  setRazorpayTransportForTests(fake.transport);
  execFileSync(
    process.execPath,
    [path.join(process.cwd(), "scripts", "run-with-mem.js"), "npx", "prisma", "validate", "--schema", "prisma/schema.postgres.prisma"],
    { cwd: process.cwd(), stdio: "inherit" },
  );
});

after(async () => {
  setRazorpayTransportForTests?.(null);
  if (prisma) await prisma.$disconnect().catch(() => undefined);
  for (const extra of ["", "-wal", "-shm", "-journal"]) {
    fs.rmSync(`${dbPath}${extra}`, { force: true });
  }
});

async function seedRestaurant(suffix: string, extras?: { razorpay?: boolean; webhooks?: boolean }) {
  const tenant = await prisma.tenant.create({
    data: {
      name: `T ${suffix}`,
      nameNormalized: `t ${suffix}`,
      slug: `t-${suffix}`,
      isEnabled: true,
    },
  });
  const restaurant = await prisma.restaurant.create({
    data: {
      name: `R ${suffix}`,
      nameNormalized: `r ${suffix}`,
      slug: `r-${suffix}`,
      tenantId: tenant.id,
      receiptFooter: "Thanks",
      featureFlags: extras?.webhooks ? JSON.stringify({ payment_webhooks: true }) : "{}",
      paymentGatewayProvider: extras?.razorpay ? "RAZORPAY" : null,
      paymentGatewayKeyId: extras?.razorpay ? "rzp_test_key" : null,
      paymentGatewaySecretEnc: extras?.razorpay ? encryptSecret("rzp_test_secret") : null,
      paymentWebhookSecretEnc: extras?.razorpay ? encryptSecret("whsec_test") : null,
    },
  });
  invalidateFeatureCache(restaurant.id);
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
}) {
  const order = await prisma.order.create({
    data: {
      orderNumber: params.orderNumber,
      restaurantId: params.restaurantId,
      tableId: params.tableId,
      status: "SERVED",
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

async function seedStaff(restaurantId: string, role: "OWNER" | "MANAGER" | "SERVER" | "COOK", suffix: string) {
  return prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${suffix}@example.test`,
      name: `${role} ${suffix}`,
      role,
      restaurantId,
      passwordHash: await hashPassword("password-12"),
    },
  });
}

function forensicCtx(overrides?: Record<string, unknown>) {
  return {
    requestId: generateRequestId(),
    startedAt: Date.now(),
    method: "PATCH",
    routeTemplate: "/api/test",
    hostname: "abc.dvadtech.in",
    clientIp: "49.37.120.82",
    clientIpSource: "trusted-proxy",
    userAgent: "M4Test/1.0",
    source: "API",
    actor: { type: "STAFF" as const, id: "actor-1", name: "Alice", role: "OWNER", sessionId: "sess-1" },
    tenant: { restaurantId: null as string | null },
    ...overrides,
  };
}

async function eventsWhere(where: Record<string, unknown>) {
  return prisma.platformAuditEvent.findMany({ where, orderBy: { occurredAt: "asc" } });
}

function signedRazorpay(body: Record<string, unknown>, secret = "whsec_test") {
  const rawBody = JSON.stringify(body);
  return {
    rawBody,
    headers: new Headers({
      "x-razorpay-signature": createHmac("sha256", secret).update(rawBody).digest("hex"),
    }),
  };
}

function checkoutSignature(orderId: string, paymentId: string, secret = "rzp_test_secret") {
  return createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}

function setNodeEnv(value: string | undefined) {
  if (value === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = value;
}

function auditRequest(url: string, extras?: { host?: string; cookie?: string; method?: string }) {
  const headers: Record<string, string> = {
    host: extras?.host ?? "dvadtech.in",
    "user-agent": "M4AuditUI/1.0",
  };
  if (extras?.cookie) headers.cookie = extras.cookie;
  return new NextRequest(url, { method: extras?.method ?? "GET", headers });
}

describe("M4 forensic audit", () => {
  it("redacts secrets from forensic rows and operational logger metadata", async () => {
    const secret = "super-secret-password-value-xyz";
    await runWithForensicContext(forensicCtx(), async () => {
      await appendPlatformAuditEvent({
        category: "SECURITY",
        action: "STAFF_UPDATED",
        metadata: {
          password: secret,
          passwordHash: secret,
          Authorization: `Bearer ${secret}`,
          Cookie: `sid=${secret}`,
          gatewaySecret: secret,
          webhookSecret: secret,
          printerAgentToken: secret,
          tokenHash: secret,
          nested: { clientSecret: secret },
          list: [{ refreshToken: secret }],
        },
        before: { password: secret, role: "SERVER" },
        after: { password: "new", role: "MANAGER" },
      });
    });
    const rows = await prisma.$queryRawUnsafe<Array<{ metadataJson: string | null; beforeJson: string | null; afterJson: string | null; diffJson: string | null }>>(
      `SELECT metadataJson, beforeJson, afterJson, diffJson FROM PlatformAuditEvent ORDER BY recordedAt DESC LIMIT 1`,
    );
    const blob = JSON.stringify(rows[0]);
    assert.ok(!blob.includes(secret));
    assert.ok(blob.includes("[REDACTED]"));
    const line = formatOperationalLogLine("info", "test", "logger meta", {
      password: secret,
      token: secret,
      nested: { webhookSecret: secret },
    });
    assert.ok(!line.includes(secret));
    assert.ok(line.includes("[REDACTED]"));
    const leakedMessage = formatOperationalLogLine("error", "api:/api/orders/[id]", "GET failed: boom token=abc.def");
    assert.ok(!leakedMessage.includes("token=abc.def"));
    assert.ok(leakedMessage.includes("[REDACTED]"));
    const redacted = redactSecrets({ publicTokenPresent: true, token: secret });
    assert.equal((redacted as { publicTokenPresent: boolean }).publicTokenPresent, true);
    assert.equal((redacted as { token: string }).token, "[REDACTED]");
  });

  it("rejects Prisma update and delete of PlatformAuditEvent", async () => {
    const created = await runWithForensicContext(forensicCtx(), () =>
      appendPlatformAuditEvent({
        category: "SYSTEM",
        action: "API_REQUEST",
        metadata: { marker: "append-only" },
      }),
    );
    const row = await prisma.platformAuditEvent.findFirst({
      where: { metadataJson: { contains: "append-only" } },
    });
    assert.ok(row);
    await assert.rejects(() =>
      prisma.platformAuditEvent.update({
        where: { id: row.id },
        data: { action: "TAMPERED" },
      }),
    );
    await assert.rejects(() => prisma.platformAuditEvent.delete({ where: { id: row.id } }));
    const again = await prisma.platformAuditEvent.findUnique({ where: { id: row.id } });
    assert.equal(again?.action, created.action);
    assert.equal(again?.action, "API_REQUEST");
    const pg = fs.readFileSync(
      path.join(process.cwd(), "prisma/migrations-postgres/000017_m4_platform_forensic_audit/migration.sql"),
      "utf8",
    );
    assert.ok(pg.includes("prevent_platform_audit_event_mutation"));
    assert.ok(pg.includes("BEFORE UPDATE"));
    assert.ok(pg.includes("BEFORE DELETE"));
  });

  it("captures IPv4, IPv6, trusted proxy, and rejects spoofed X-Forwarded-For", () => {
    const trustedV4 = resolveClientIp(new Headers({ "x-forwarded-for": "49.37.120.82" }), {
      hostname: "abc.dvadtech.in",
      env: { FORENSIC_TRUST_PROXY: "1" } as NodeJS.ProcessEnv,
    });
    assert.equal(trustedV4.clientIp, "49.37.120.82");
    assert.equal(trustedV4.clientIpSource, "trusted-proxy");

    const trustedV6 = resolveClientIp(new Headers({ "x-forwarded-for": "2401:4900:1f3a:2::1" }), {
      hostname: "abc.dvadtech.in",
      env: { FORENSIC_TRUST_PROXY: "1" } as NodeJS.ProcessEnv,
    });
    assert.equal(trustedV6.clientIp, "2401:4900:1f3a:2::1");

    const spoofed = resolveClientIp(new Headers({ "x-forwarded-for": "8.8.8.8", "x-real-ip": "1.1.1.1" }), {
      hostname: "abc.dvadtech.in",
      env: {} as NodeJS.ProcessEnv,
    });
    assert.equal(spoofed.clientIp, null);
    assert.equal(spoofed.clientIpSource, "untrusted");

    const local = resolveClientIp(new Headers({ "x-forwarded-for": "8.8.8.8" }), {
      hostname: "localhost",
      env: {} as NodeJS.ProcessEnv,
    });
    assert.equal(local.clientIp, "127.0.0.1");
    assert.equal(local.clientIpSource, "local");
  });

  it("records a request event with requestId, actor, IP, host, and duration", async () => {
    process.env.FORENSIC_TRUST_PROXY = "1";
    const { restaurant } = await seedRestaurant(`req-${Date.now()}`);
    const handler = withForensicApiRoute(async () => {
      setForensicActor({ type: "STAFF", id: "staff-1", name: "Alice", role: "SERVER", sessionId: "sess-9" });
      setForensicTenant({ restaurantId: restaurant.id });
      return NextResponse.json({ ok: true });
    });
    const req = new NextRequest("http://abc.dvadtech.in/api/orders/clxyz", {
      headers: {
        host: "abc.dvadtech.in",
        "user-agent": "M4Test/1.0",
        "x-forwarded-for": "49.37.120.82",
      },
    });
    const res = await handler(req, {});
    assert.equal(res.status, 200);
    const requestId = res.headers.get("x-request-id");
    assert.ok(requestId);
    const event = await prisma.platformAuditEvent.findFirst({
      where: { requestId, action: "API_REQUEST" },
    });
    assert.ok(event);
    assert.equal(event.actorName, "Alice");
    assert.equal(event.actorRole, "SERVER");
    assert.equal(event.clientIp, "49.37.120.82");
    assert.equal(event.hostname, "abc.dvadtech.in");
    assert.equal(event.httpMethod, "GET");
    assert.equal(event.route, "/api/orders/[id]");
    assert.equal(event.restaurantId, restaurant.id);
    assert.equal(event.httpStatus, 200);
    assert.equal(event.outcome, "SUCCESS");
    assert.ok((event.durationMs ?? 0) >= 0);
    assert.ok(!event.route?.includes("?"));
    delete process.env.FORENSIC_TRUST_PROXY;
  });

  it("records REQUEST_FAILED without a stack in PlatformAuditEvent", async () => {
    const handler = withForensicApiRoute(async () => {
      throw new Error("controlled boom token=abc.def");
    });
    const req = new NextRequest("http://abc.dvadtech.in/api/orders/clfail", {
      headers: { host: "abc.dvadtech.in" },
    });
    const res = await handler(req, {});
    assert.equal(res.status, 500);
    const requestId = res.headers.get("x-request-id");
    const event = await prisma.platformAuditEvent.findFirst({
      where: { requestId, action: "REQUEST_FAILED" },
    });
    assert.ok(event);
    assert.equal(event.outcome, "FAILED");
    assert.ok(event.errorFingerprint);
    assert.ok(event.errorType);
    const blob = JSON.stringify(event);
    assert.ok(!blob.includes("\\n    at "));
    assert.ok(!blob.includes("token=abc.def"));
    assert.ok(!Object.keys(event as object).includes("stack"));
  });

  it("records MENU_ITEM_PRICE_CHANGED with before/after/diff", async () => {
    const suffix = `menu-${Date.now()}`;
    const { restaurant, menuItem } = await seedRestaurant(suffix);
    const ctx = forensicCtx({
      tenant: { restaurantId: restaurant.id },
      actor: { type: "STAFF", id: "mgr-1", name: "Alice", role: "MANAGER" },
    });
    await runWithForensicContext(ctx, () =>
      updateManagedMenuItemForRestaurant({
        restaurantId: restaurant.id,
        item: menuItem,
        nextPrice: 230,
      }),
    );
    const event = await prisma.platformAuditEvent.findFirst({
      where: { action: "MENU_ITEM_PRICE_CHANGED", resourceId: menuItem.id },
    });
    assert.ok(event);
    assert.equal(event.actorName, "Alice");
    assert.equal(event.clientIp, "49.37.120.82");
    assert.equal(event.restaurantId, restaurant.id);
    assert.equal(event.outcome, "SUCCESS");
    assert.equal(event.requestId, ctx.requestId);
    const before = JSON.parse(event.beforeJson ?? "{}") as { price: number };
    const after = JSON.parse(event.afterJson ?? "{}") as { price: number };
    const diff = JSON.parse(event.diffJson ?? "{}") as { price: { from: number; to: number } };
    assert.equal(before.price, 200);
    assert.equal(after.price, 230);
    assert.equal(diff.price.from, 200);
    assert.equal(diff.price.to, 230);
    const blob = JSON.stringify(event);
    assert.ok(!blob.toLowerCase().includes("password"));
  });

  it("records STAFF_ROLE_CHANGED SERVER → MANAGER", async () => {
    const suffix = `staff-${Date.now()}`;
    const { restaurant } = await seedRestaurant(suffix);
    const staff = await seedStaff(restaurant.id, "SERVER", suffix);
    const ctx = forensicCtx({
      tenant: { restaurantId: restaurant.id },
      actor: { type: "STAFF", id: "owner-1", name: "Owner Pat", role: "OWNER" },
    });
    await runWithForensicContext(ctx, () =>
      prisma.$transaction((tx) =>
        applyStaffUserMutationInTx(tx, {
          userId: staff.id,
          existing: staff,
          data: { role: "MANAGER" },
        }),
      ),
    );
    const event = await prisma.platformAuditEvent.findFirst({
      where: { action: "STAFF_ROLE_CHANGED", resourceId: staff.id },
    });
    assert.ok(event);
    assert.equal(event.actorName, "Owner Pat");
    assert.equal(event.restaurantId, restaurant.id);
    assert.equal(event.clientIp, "49.37.120.82");
    assert.equal(event.requestId, ctx.requestId);
    assert.equal(JSON.parse(event.beforeJson ?? "{}").role, "SERVER");
    assert.equal(JSON.parse(event.afterJson ?? "{}").role, "MANAGER");
    const updated = await prisma.user.findUnique({ where: { id: staff.id } });
    assert.equal(updated?.role, "MANAGER");
  });

  it("rolls back a critical staff mutation when the forensic insert fails", async () => {
    const suffix = `txfail-${Date.now()}`;
    const { restaurant } = await seedRestaurant(suffix);
    const staff = await seedStaff(restaurant.id, "SERVER", suffix);
    await assert.rejects(() =>
      prisma.$transaction(async (tx) =>
        applyStaffUserMutationInTx(
          {
            user: tx.user,
            platformAuditEvent: {
              create: async () => {
                throw new Error("FORENSIC_TEST_INSERT_FAIL");
              },
            },
          },
          {
            userId: staff.id,
            existing: staff,
            data: { role: "MANAGER" },
          },
        ),
      ),
    );
    const again = await prisma.user.findUnique({ where: { id: staff.id } });
    assert.equal(again?.role, "SERVER");
  });

  it("records money lifecycle without inventing amounts or double-capture on webhook replay", async () => {
    const suffix = `money-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix, { razorpay: true, webhooks: true });
    const cashOrder = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 150,
    });
    const ctx = forensicCtx({ tenant: { restaurantId: restaurant.id } });
    await runWithForensicContext(ctx, async () => {
      const bill = await finalizeOrderBill({ orderId: cashOrder.id, restaurantId: restaurant.id });
      assert.equal(bill.ok, true);
      const cash = await recordOrderPayment({
        orderId: cashOrder.id,
        amount: 150,
        method: "CASH",
        collectedByName: "Alice",
      });
      assert.equal(cash.ok, true);
      if (!cash.ok || !cash.payment) throw new Error("cash failed");
      const refund = await refundCapturedPayment({
        paymentId: cash.payment.id,
        restaurantId: restaurant.id,
        actorName: "Alice",
      });
      assert.equal(refund.ok, true);
    });

    const upiTable = await prisma.table.create({
      data: { number: 5, restaurantId: restaurant.id, qrToken: `qr-${suffix}-upi` },
    });
    const upiOrder = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: upiTable.id,
      menuItemId: menuItem.id,
      orderNumber: 2,
      unitPrice: 180,
    });
    await runWithForensicContext(ctx, async () => {
      const submitted = await initiateManualUpiPayment({ orderId: upiOrder.id, tableId: upiTable.id });
      assert.equal(submitted.ok, true);
      if (!submitted.ok || !submitted.payment) throw new Error("upi start failed");
      const verified = await confirmManualUpiPayment({
        paymentId: submitted.payment.id,
        restaurantId: restaurant.id,
        actorName: "Alice",
      });
      assert.equal(verified.ok, true);
    });

    const rzTable = await prisma.table.create({
      data: { number: 6, restaurantId: restaurant.id, qrToken: `qr-${suffix}-rz` },
    });
    const rzOrder = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: rzTable.id,
      menuItemId: menuItem.id,
      orderNumber: 3,
      unitPrice: 210,
    });
    await runWithForensicContext(ctx, async () => {
      const created = await createOrReuseRazorpayCheckout({
        restaurantId: restaurant.id,
        orderId: rzOrder.id,
        tableId: rzTable.id,
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
      const verified = await verifyRazorpayCheckoutCallback({
        publicToken: created.checkout.publicToken,
        restaurantId: restaurant.id,
        razorpayPaymentId: paymentId,
        razorpaySignature: checkoutSignature(created.checkout.orderId!, paymentId),
      });
      assert.equal(verified.ok, true);
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
      const first = await processPaymentWebhook({
        slug: restaurant.slug,
        provider: "razorpay",
        ...signedRazorpay(payload),
      });
      assert.equal(first.ok, true);
      const replay = await processPaymentWebhook({
        slug: restaurant.slug,
        provider: "razorpay",
        ...signedRazorpay(payload),
      });
      assert.equal(replay.ok, true);
    });

    const billEvent = await prisma.platformAuditEvent.findFirst({
      where: { action: "BILL_FINALIZED", restaurantId: restaurant.id },
    });
    assert.ok(billEvent);
    const cashEvent = await prisma.platformAuditEvent.findFirst({
      where: { action: "CASH_PAYMENT_CAPTURED", restaurantId: restaurant.id },
    });
    assert.ok(cashEvent);
    const refundRequested = await prisma.platformAuditEvent.findFirst({
      where: { action: "REFUND_REQUESTED", restaurantId: restaurant.id },
    });
    assert.ok(refundRequested);
    const refundCompleted = await prisma.platformAuditEvent.findFirst({
      where: { action: "REFUND_COMPLETED", restaurantId: restaurant.id },
    });
    assert.ok(refundCompleted);
    const upiVerified = await prisma.platformAuditEvent.findFirst({
      where: { action: "MANUAL_UPI_VERIFIED", restaurantId: restaurant.id },
    });
    assert.ok(upiVerified);
    const captured = await eventsWhere({ action: "PAYMENT_CAPTURED", restaurantId: restaurant.id });
    assert.ok(captured.length >= 1);
    const replayedCapture = await eventsWhere({ action: "PAYMENT_CAPTURE_REPLAYED", restaurantId: restaurant.id });
    const webhookReplay = await eventsWhere({ action: "RAZORPAY_WEBHOOK_REPLAYED", restaurantId: restaurant.id });
    assert.ok(replayedCapture.length + webhookReplay.length >= 1);
    const capturedPayments = await prisma.payment.findMany({
      where: { restaurantId: restaurant.id, status: "CAPTURED", provider: "razorpay" },
    });
    assert.equal(capturedPayments.length, 1);
  });

  it("records gateway secret rotation without storing the secret", async () => {
    const suffix = `gw-${Date.now()}`;
    const { restaurant } = await seedRestaurant(suffix, { webhooks: true });
    const secret = `rzp_live_secret_${suffix}`;
    await runWithForensicContext(forensicCtx({ tenant: { restaurantId: restaurant.id } }), () =>
      updatePaymentGatewaySettings(restaurant.id, {
        provider: "RAZORPAY",
        keyId: "rzp_test_key",
        secret,
      }),
    );
    const event = await prisma.platformAuditEvent.findFirst({
      where: { action: "GATEWAY_CREDENTIAL_ROTATED", restaurantId: restaurant.id },
    });
    assert.ok(event);
    const meta = JSON.parse(event.metadataJson ?? "{}") as { gatewaySecretChanged?: boolean };
    assert.equal(meta.gatewaySecretChanged, true);
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, string | null>>>(
      `SELECT * FROM PlatformAuditEvent WHERE restaurantId = ?`,
      restaurant.id,
    );
    assert.ok(!JSON.stringify(rows).includes(secret));
    const token = await createPlatformAdminToken({
      id: "padmin-1",
      email: "platform@example.test",
      name: "Platform",
    });
    const previous = process.env.NODE_ENV;
    setNodeEnv("production");
    process.env.TENANT_BASE_DOMAIN = "dvadtech.in";
    const res = await auditGet(
      auditRequest("http://dvadtech.in/api/platform/audit?category=CONFIG", {
        host: "dvadtech.in",
        cookie: `${PLATFORM_ADMIN_COOKIE}=${token}`,
      }),
      {},
    );
    setNodeEnv(previous);
    const body = await res.json();
    assert.ok(!JSON.stringify(body).includes(secret));
  });

  it("records printing claim/ack/fail/retry/reprint/ambiguous and agent lifecycle without tokens", async () => {
    const suffix = `print-${Date.now()}`;
    const { restaurant, table } = await seedRestaurant(suffix);
    const created = await createPrinterAgent({ restaurantId: restaurant.id, name: "Kitchen Pi" });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const auth = await authenticatePrinterAgent(`Bearer ${created.token}`);
    assert.ok(auth);
    const orderA = await prisma.order.create({
      data: {
        orderNumber: 1,
        restaurantId: restaurant.id,
        tableId: table.id,
        status: "PENDING",
        date: todayDateString(),
      },
    });
    const orderB = await prisma.order.create({
      data: {
        orderNumber: 2,
        restaurantId: restaurant.id,
        tableId: table.id,
        status: "PENDING",
        date: todayDateString(),
      },
    });
    const first = await enqueueKitchenChitForOrder({
      restaurantId: restaurant.id,
      orderId: orderA.id,
      orderNumber: 1,
      tableNumber: table.number,
      items: [{ name: "Tea", quantity: 1 }],
    });
    const claimed = await claimNextPrintJob(auth);
    assert.ok(claimed.job);
    await reportPrintJobResult({
      agent: auth,
      jobId: claimed.job.id,
      claimToken: claimed.job.claimToken,
      outcome: "ACKED",
    });
    const failJob = await enqueueKitchenChitForOrder({
      restaurantId: restaurant.id,
      orderId: orderB.id,
      orderNumber: 2,
      tableNumber: table.number,
      items: [{ name: "Tea", quantity: 1 }],
    });
    const claimedFail = await claimNextPrintJob(auth);
    assert.ok(claimedFail.job);
    await reportPrintJobResult({
      agent: auth,
      jobId: claimedFail.job.id,
      claimToken: claimedFail.job.claimToken,
      outcome: "FAILED",
      errorCode: "INVALID_PAYLOAD",
    });
    await retryPrintJobForRestaurant(failJob.id, restaurant.id);
    await reprintPrintJobForRestaurant({ jobId: first.id, restaurantId: restaurant.id });
    const reprint = await prisma.printJob.findFirst({
      where: { restaurantId: restaurant.id, reprintOfPrintJobId: first.id },
    });
    assert.ok(reprint);
    const claimedReprint = await claimNextPrintJob(auth);
    assert.ok(claimedReprint.job);
    await prisma.printJob.update({
      where: { id: claimedReprint.job.id },
      data: { leaseExpiresAt: new Date(Date.now() - 1000) },
    });
    await recoverExpiredPrintLeases(restaurant.id);
    await updatePrinterAgent({ restaurantId: restaurant.id, agentId: created.agent.id, rotateToken: true });
    await updatePrinterAgent({ restaurantId: restaurant.id, agentId: created.agent.id, revoke: true });

    const actions = new Set(
      (await eventsWhere({ restaurantId: restaurant.id, category: "PRINTING" })).map((row) => row.action),
    );
    for (const action of [
      "PRINT_JOB_QUEUED",
      "PRINT_JOB_CLAIMED",
      "PRINT_JOB_ACKED",
      "PRINT_JOB_FAILED",
      "PRINT_JOB_MANUAL_RETRY",
      "PRINT_JOB_REPRINTED",
      "PRINT_JOB_AMBIGUOUS",
      "PRINTER_AGENT_CREATED",
      "PRINTER_AGENT_TOKEN_ROTATED",
      "PRINTER_AGENT_REVOKED",
    ]) {
      assert.ok(actions.has(action), `missing ${action}`);
    }
    const printRows = await prisma.$queryRawUnsafe<Array<Record<string, string | null>>>(
      `SELECT * FROM PlatformAuditEvent WHERE restaurantId = ? AND category = 'PRINTING'`,
      restaurant.id,
    );
    const blob = JSON.stringify(printRows);
    assert.ok(!blob.includes(created.token));
    assert.ok(!blob.includes("tokenHash"));
    const queued = await prisma.platformAuditEvent.findFirst({
      where: { action: "PRINT_JOB_QUEUED", restaurantId: restaurant.id },
    });
    assert.ok(queued?.resourceId);
  });

  it("records security denials while keeping opaque external responses", async () => {
    const suffix = `sec-${Date.now()}`;
    const a = await seedRestaurant(`${suffix}-a`);
    const b = await seedRestaurant(`${suffix}-b`);
    const staff = await seedStaff(a.restaurant.id, "SERVER", suffix);
    const orderB = await seedServedOrder({
      restaurantId: b.restaurant.id,
      tableId: b.table.id,
      menuItemId: b.menuItem.id,
      orderNumber: 1,
      unitPrice: 100,
    });
    process.env.TENANT_BASE_DOMAIN = "dvadtech.in";
    const unknownReq = new NextRequest("http://no-such-restaurant.dvadtech.in/api/auth/login", {
      method: "POST",
      headers: { host: "no-such-restaurant.dvadtech.in", "content-type": "application/json" },
    });
    unknownReq.json = async () => ({ email: staff.email, password: "password-12" });
    const unknownHost = await loginPost(unknownReq, {});
    assert.equal(unknownHost.status, 404);
    const wrongHost = await prisma.platformAuditEvent.findFirst({
      where: { action: "WRONG_HOST_ACCESS_DENIED" },
      orderBy: { occurredAt: "desc" },
    });
    assert.ok(wrongHost);

    const mismatchReq = new NextRequest(`http://r-${suffix}-b.dvadtech.in/api/auth/login`, {
      method: "POST",
      headers: { host: `r-${suffix}-b.dvadtech.in`, "content-type": "application/json" },
    });
    mismatchReq.json = async () => ({ email: staff.email, password: "password-12" });
    const mismatch = await loginPost(mismatchReq, {});
    assert.ok(mismatch.status === 401 || mismatch.status === 404);

    const req = new NextRequest(`http://r-${suffix}-a.dvadtech.in/api/orders/${orderB.id}`, {
      headers: { host: `r-${suffix}-a.dvadtech.in` },
    });
    const loaded = await loadOrderByIdForRequest(req, orderB.id);
    assert.equal(loaded.order, null);
    const cross = await prisma.platformAuditEvent.findFirst({
      where: { action: "CROSS_RESTAURANT_ACCESS_DENIED", resourceId: orderB.id },
    });
    assert.ok(cross);
    assert.equal(JSON.parse(cross.metadataJson ?? "{}").attemptedResourceRestaurantId, b.restaurant.id);

    const created = await createPrinterAgent({ restaurantId: a.restaurant.id, name: "Agent" });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const invalid = await authenticatePrinterAgent("Bearer not-a-valid-token");
    assert.equal(invalid, null);
    const invalidEvent = await prisma.platformAuditEvent.findFirst({
      where: { action: "INVALID_PRINTER_AGENT_TOKEN" },
      orderBy: { occurredAt: "desc" },
    });
    assert.ok(invalidEvent);
    await updatePrinterAgent({ restaurantId: a.restaurant.id, agentId: created.agent.id, revoke: true });
    const revoked = await authenticatePrinterAgent(`Bearer ${created.token}`);
    assert.equal(revoked, null);
    const revokedEvent = await prisma.platformAuditEvent.findFirst({
      where: { action: "REVOKED_PRINTER_AGENT_TOKEN", actorId: created.agent.id },
    });
    assert.ok(revokedEvent);

    await prisma.restaurant.update({
      where: { id: a.restaurant.id },
      data: {
        featureFlags: JSON.stringify({ payment_webhooks: true }),
        paymentGatewayProvider: "RAZORPAY",
        paymentWebhookSecretEnc: encryptSecret("whsec_test"),
      },
    });
    invalidateFeatureCache(a.restaurant.id);
    const badSig = await processPaymentWebhook({
      slug: a.restaurant.slug,
      provider: "razorpay",
      rawBody: JSON.stringify({ event: "payment.captured" }),
      headers: new Headers({ "x-razorpay-signature": "deadbeef" }),
    });
    assert.equal(badSig.ok, false);
    const sigEvent = await prisma.platformAuditEvent.findFirst({
      where: { action: "RAZORPAY_SIGNATURE_INVALID", restaurantId: a.restaurant.id },
    });
    assert.ok(sigEvent);
  });

  it("gates the platform audit API to exact apex + PlatformAdmin", async () => {
    const token = await createPlatformAdminToken({
      id: "padmin-gate",
      email: "platform@example.test",
      name: "Platform",
    });
    const tenantToken = await createTenantAdminToken({
      id: "tadmin-1",
      email: "tenant@example.test",
      name: "Tenant",
      tenantId: "tenant-1",
    });
    const previous = process.env.NODE_ENV;
    setNodeEnv("production");
    process.env.TENANT_BASE_DOMAIN = "dvadtech.in";

    const allowed = await auditGet(
      auditRequest("http://dvadtech.in/api/platform/audit?limit=5", {
        cookie: `${PLATFORM_ADMIN_COOKIE}=${token}`,
      }),
      {},
    );
    assert.equal(allowed.status, 200);

    const restaurantHost = await auditGet(
      auditRequest("http://abc.dvadtech.in/api/platform/audit", {
        host: "abc.dvadtech.in",
        cookie: `${PLATFORM_ADMIN_COOKIE}=${token}`,
      }),
      {},
    );
    assert.equal(restaurantHost.status, 404);

    const www = await auditGet(
      auditRequest("http://www.dvadtech.in/api/platform/audit", {
        host: "www.dvadtech.in",
        cookie: `${PLATFORM_ADMIN_COOKIE}=${token}`,
      }),
      {},
    );
    assert.equal(www.status, 404);

    const unauth = await auditGet(auditRequest("http://dvadtech.in/api/platform/audit"), {});
    assert.equal(unauth.status, 404);

    const tenant = await auditGet(
      auditRequest("http://dvadtech.in/api/platform/audit", {
        cookie: `${TENANT_ADMIN_COOKIE}=${tenantToken}`,
      }),
      {},
    );
    assert.equal(tenant.status, 404);

    const tamper = await auditDelete(
      auditRequest("http://dvadtech.in/api/platform/audit", {
        cookie: `${PLATFORM_ADMIN_COOKIE}=${token}`,
        method: "DELETE",
      }),
      {},
    );
    assert.equal(tamper.status, 405);
    setNodeEnv("development");
    const local = await auditGet(
      auditRequest("http://localhost/api/platform/audit", {
        host: "localhost",
        cookie: `${PLATFORM_ADMIN_COOKIE}=${token}`,
      }),
      {},
    );
    assert.equal(local.status, 200);
    setNodeEnv(previous);

    const viewed = await eventsWhere({ action: "AUDIT_VIEWED" });
    assert.ok(viewed.length >= 1);
    const denied = await eventsWhere({ action: "PLATFORM_AUDIT_ACCESS_DENIED" });
    assert.ok(denied.length >= 3);
    const tamperEvent = await prisma.platformAuditEvent.findFirst({
      where: { action: "AUDIT_TAMPER_ATTEMPT" },
    });
    assert.ok(tamperEvent);
  });

  it("creates exactly one AUDIT_VIEWED event per query and supports filters/pagination", async () => {
    const token = await createPlatformAdminToken({
      id: "padmin-view",
      email: "platform@example.test",
      name: "Platform",
    });
    const restaurantId = `rest-filter-${Date.now()}`;
    await runWithForensicContext(forensicCtx({ tenant: { restaurantId } }), async () => {
      for (let i = 0; i < 5; i += 1) {
        await appendPlatformAuditEvent({
          category: "MONEY",
          action: "REFUND_COMPLETED",
          restaurantId,
          resourceType: "Order",
          resourceId: `order-${i}`,
          metadata: { i },
        });
      }
    });
    const before = await prisma.platformAuditEvent.count({ where: { action: "AUDIT_VIEWED" } });
    const previous = process.env.NODE_ENV;
    setNodeEnv("production");
    process.env.TENANT_BASE_DOMAIN = "dvadtech.in";
    const first = await auditGet(
      auditRequest(
        `http://dvadtech.in/api/platform/audit?category=MONEY&action=REFUND_COMPLETED&restaurantId=${restaurantId}&limit=2`,
        { cookie: `${PLATFORM_ADMIN_COOKIE}=${token}` },
      ),
      {},
    );
    assert.equal(first.status, 200);
    const page1 = (await first.json()) as { events: Array<{ id: string; action: string }>; nextCursor: string | null };
    assert.equal(page1.events.length, 2);
    assert.ok(page1.nextCursor);
    const second = await auditGet(
      auditRequest(
        `http://dvadtech.in/api/platform/audit?category=MONEY&action=REFUND_COMPLETED&restaurantId=${restaurantId}&limit=2&cursor=${page1.nextCursor}`,
        { cookie: `${PLATFORM_ADMIN_COOKIE}=${token}` },
      ),
      {},
    );
    const page2 = (await second.json()) as { events: Array<{ id: string }>; nextCursor: string | null };
    const ids = [...page1.events, ...page2.events].map((row) => row.id);
    assert.equal(new Set(ids).size, ids.length);
    const after = await prisma.platformAuditEvent.count({ where: { action: "AUDIT_VIEWED" } });
    assert.equal(after, before + 2);
    const filtered = await queryPlatformAuditEvents({
      category: "MONEY",
      action: "REFUND_COMPLETED",
      restaurantId,
      limit: 50,
    });
    assert.equal(filtered.events.length, 5);
    const byRequest = await queryPlatformAuditEvents({
      requestId: forensicCtx().requestId,
      limit: 10,
    });
    assert.ok(Array.isArray(byRequest.events));
    setNodeEnv(previous);
  });
});

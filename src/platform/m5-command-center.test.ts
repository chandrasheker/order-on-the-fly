import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { NextRequest } from "next/server";
import type { PrismaClient } from "@/generated/prisma/client";
import { todayDateString } from "@/lib/utils";
import {
  classifyKitchenLoad,
  classifyMoneyHealth,
  classifyPrintingHealth,
  classifyServiceLoad,
  slaLabel,
} from "@/platform/command-center/classify";
import { ledgerRevenueFromPayments, staffCollectedFromPayments } from "@/platform/command-center/money-metrics";
import { loadReliabilityByRestaurant } from "@/platform/command-center/reliability-service";
import { resolveTimeRange } from "@/platform/command-center/time-range";
import { COMMAND_CENTER_THRESHOLDS } from "@/platform/command-center/thresholds";

const dbPath = path.join(os.tmpdir(), `tabletap-m5-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_URL = `file:${dbPath}`;
process.env.JWT_SECRET = process.env.JWT_SECRET || "m5-test-jwt-secret-must-be-32-chars!!";
process.env.TENANT_BASE_DOMAIN = "dvadtech.in";

let prisma: PrismaClient;
let queryPlatformAuditEvents: typeof import("@/platform/forensics/platform-audit-service").queryPlatformAuditEvents;
let createPlatformAdminToken: typeof import("@/lib/auth").createPlatformAdminToken;
let PLATFORM_ADMIN_COOKIE: typeof import("@/lib/auth").PLATFORM_ADMIN_COOKIE;
let platformLogsGet: typeof import("@/app/api/platform/logs/route").GET;
let tenantLogsGet: typeof import("@/app/api/platform/tenants/[tenantId]/logs/route").GET;
let restaurantLogsGet: typeof import("@/app/api/platform/tenants/[tenantId]/restaurants/[restaurantId]/logs/route").GET;
let commandGet: typeof import("@/app/api/platform/command-center/route").GET;
let tenantCommandGet: typeof import("@/app/api/platform/tenants/[tenantId]/command/route").GET;
let restaurantCommandGet: typeof import("@/app/api/platform/tenants/[tenantId]/restaurants/[restaurantId]/command/route").GET;

describe("M5 command-center classification", () => {
  it("classifies kitchen load from paused, overdue, and backlog only", () => {
    assert.equal(classifyKitchenLoad({ kitchenPaused: false, overdueCount: 0, backlogCount: 2 }).level, "NORMAL");
    assert.equal(classifyKitchenLoad({ kitchenPaused: false, overdueCount: 1, backlogCount: 2 }).level, "BUSY");
    assert.equal(classifyKitchenLoad({ kitchenPaused: false, overdueCount: 4, backlogCount: 2 }).level, "HIGH");
    assert.equal(classifyKitchenLoad({ kitchenPaused: true, overdueCount: 0, backlogCount: 0 }).level, "OVERWHELMED");
    assert.ok(classifyKitchenLoad({ kitchenPaused: true, overdueCount: 0, backlogCount: 0 }).reasons.includes("Kitchen is paused"));
  });

  it("never labels Never missed SLA below the sample floor", () => {
    const small = slaLabel({ missedCount: 0, sampleCount: 23, onTimePercent: 100 });
    assert.equal(small.neverMissed, false);
    assert.match(small.text, /100% so far — 23 eligible items/);
    const enough = slaLabel({
      missedCount: 0,
      sampleCount: COMMAND_CENTER_THRESHOLDS.slaNeverMissedMinSample,
      onTimePercent: 100,
    });
    assert.equal(enough.neverMissed, true);
    assert.equal(enough.text, "Never missed SLA");
    const missed = slaLabel({ missedCount: 2, sampleCount: 120, onTimePercent: 98.3 });
    assert.equal(missed.neverMissed, false);
  });

  it("keeps payment and print health transparent", () => {
    const money = classifyMoneyHealth({
      pendingGatewayAttempts: 3,
      failedGatewayAttempts: 0,
      refundPending: 0,
      refundFailures: 0,
      reconciliationVariancePaise: 250000,
      cashVariancePaise: 0,
    });
    assert.equal(money.level, "ATTENTION");
    assert.ok(money.reasons.some((reason) => reason.includes("pending gateway")));
    assert.ok(money.reasons.some((reason) => reason.includes("250000 paise")));

    const printing = classifyPrintingHealth({
      enabledAgentCount: 1,
      onlineAgentCount: 0,
      lastSeenAt: new Date(Date.now() - 12 * 60_000).toISOString(),
      lastSeenAgoMs: 12 * 60_000,
      failures: 0,
      ambiguous: 2,
      queueDepth: 1,
      lastError: null,
    });
    assert.equal(printing.level, "OFFLINE");
  });

  it("does not treat gateway attempts as captured revenue", () => {
    const revenue = ledgerRevenueFromPayments([
      { amount: 500, status: "CAPTURED", method: "CASH" },
      { amount: 200, status: "PENDING", method: "UPI" },
      { amount: 100, status: "FAILED", method: "UPI" },
      { amount: 50, status: "REFUNDED", refundOfPaymentId: "p1", method: "UPI" },
    ]);
    assert.equal(revenue.capturedGrossPaise, 50000);
    assert.equal(revenue.refundsPaise, 5000);
    assert.equal(revenue.netCapturedPaise, 45000);
    assert.equal(revenue.paymentCount, 1);
    assert.equal(revenue.cashPaise, 50000);
  });

  it("allows period net captured to go negative", () => {
    const refundOnly = ledgerRevenueFromPayments([
      { amount: 500, status: "REFUNDED", refundOfPaymentId: "p1", method: "UPI" },
    ]);
    assert.equal(refundOnly.capturedGrossPaise, 0);
    assert.equal(refundOnly.refundsPaise, 50000);
    assert.equal(refundOnly.netCapturedPaise, -50000);

    const mixed = ledgerRevenueFromPayments([
      { amount: 500, status: "CAPTURED", method: "CASH" },
      { amount: 200, status: "REFUNDED", refundOfPaymentId: "p1", method: "CASH" },
    ]);
    assert.equal(mixed.netCapturedPaise, 30000);
  });

  it("counts only captured non-refund payments as staff collected revenue", () => {
    const collected = staffCollectedFromPayments([
      { amount: 500, status: "CAPTURED", method: "CASH", collectedByUserId: "u1" },
      { amount: 200, status: "PENDING", method: "UPI", collectedByUserId: "u1" },
      { amount: 100, status: "REFUNDED", refundOfPaymentId: "p1", method: "UPI", collectedByUserId: "u1" },
    ]);
    assert.equal(collected.paymentsCollected, 1);
    assert.equal(collected.revenueCollectedPaise, 50000);
  });

  it("does not treat missing reconciliation as zero variance", () => {
    const missing = classifyMoneyHealth({
      pendingGatewayAttempts: 0,
      failedGatewayAttempts: 0,
      refundPending: 0,
      refundFailures: 0,
      reconciliationVariancePaise: null,
      cashVariancePaise: null,
    });
    assert.equal(missing.level, "HEALTHY");
    assert.ok(!missing.reasons.some((reason) => reason.includes("variance")));

    const zero = classifyMoneyHealth({
      pendingGatewayAttempts: 0,
      failedGatewayAttempts: 0,
      refundPending: 0,
      refundFailures: 0,
      reconciliationVariancePaise: 0,
      cashVariancePaise: 0,
    });
    assert.equal(zero.level, "HEALTHY");
  });

  it("does not call zero printer agents HEALTHY", () => {
    const none = classifyPrintingHealth({
      enabledAgentCount: 0,
      onlineAgentCount: 0,
      lastSeenAt: null,
      lastSeenAgoMs: null,
      failures: 0,
      ambiguous: 0,
      queueDepth: 0,
      lastError: null,
    });
    assert.equal(none.level, "NOT_CONFIGURED");

    const fresh = classifyPrintingHealth({
      enabledAgentCount: 1,
      onlineAgentCount: 1,
      lastSeenAt: new Date().toISOString(),
      lastSeenAgoMs: 5_000,
      failures: 0,
      ambiguous: 0,
      queueDepth: 0,
      lastError: null,
    });
    assert.equal(fresh.level, "HEALTHY");

    const stale = classifyPrintingHealth({
      enabledAgentCount: 1,
      onlineAgentCount: 0,
      lastSeenAt: new Date(Date.now() - 12 * 60_000).toISOString(),
      lastSeenAgoMs: 12 * 60_000,
      failures: 0,
      ambiguous: 0,
      queueDepth: 0,
      lastError: null,
    });
    assert.equal(stale.level, "OFFLINE");

    const ambiguous = classifyPrintingHealth({
      enabledAgentCount: 1,
      onlineAgentCount: 1,
      lastSeenAt: new Date().toISOString(),
      lastSeenAgoMs: 1_000,
      failures: 0,
      ambiguous: 2,
      queueDepth: 0,
      lastError: null,
    });
    assert.equal(ambiguous.level, "DEGRADED");
    assert.ok(ambiguous.reasons.some((reason) => reason.includes("AMBIGUOUS")));
  });

  it("compares elapsed today against the equivalent elapsed yesterday", () => {
    const now = new Date(2026, 8, 5, 10, 0, 0, 0);
    const today = resolveTimeRange({ preset: "today", now });
    assert.equal(today.from.getTime(), new Date(2026, 8, 5, 0, 0, 0, 0).getTime());
    assert.equal(today.to.getTime(), now.getTime());
    assert.equal(today.previousFrom.getTime(), new Date(2026, 8, 4, 0, 0, 0, 0).getTime());
    assert.equal(today.previousTo.getTime(), new Date(2026, 8, 4, 10, 0, 0, 0).getTime());

    const yesterday = resolveTimeRange({ preset: "yesterday", now });
    assert.equal(yesterday.from.getTime(), new Date(2026, 8, 4, 0, 0, 0, 0).getTime());
    assert.equal(yesterday.to.getTime(), new Date(2026, 8, 4, 23, 59, 59, 999).getTime());
    assert.ok(yesterday.previousFrom.getTime() < yesterday.from.getTime());
    assert.ok(yesterday.previousTo.getTime() < yesterday.from.getTime());
  });

  it("classifies service load without an opaque score", () => {
    const high = classifyServiceLoad({
      readyWaiting: 8,
      unresolvedRequests: 0,
      activeTables: 3,
      serverSessions: 1,
    });
    assert.equal(high.level, "HIGH");
    assert.ok(high.components.readyWaiting === 8);
  });
});

describe("M5 scoped forensic views", () => {
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
    ({ queryPlatformAuditEvents } = await import("@/platform/forensics/platform-audit-service"));
    ({ createPlatformAdminToken, PLATFORM_ADMIN_COOKIE } = await import("@/lib/auth"));
    ({ GET: platformLogsGet } = await import("@/app/api/platform/logs/route"));
    ({ GET: tenantLogsGet } = await import("@/app/api/platform/tenants/[tenantId]/logs/route"));
    ({ GET: restaurantLogsGet } = await import("@/app/api/platform/tenants/[tenantId]/restaurants/[restaurantId]/logs/route"));
    ({ GET: commandGet } = await import("@/app/api/platform/command-center/route"));
    ({ GET: tenantCommandGet } = await import("@/app/api/platform/tenants/[tenantId]/command/route"));
    ({ GET: restaurantCommandGet } = await import(
      "@/app/api/platform/tenants/[tenantId]/restaurants/[restaurantId]/command/route"
    ));
  });

  after(async () => {
    await prisma.$disconnect();
  });

  async function seedPair(suffix: string) {
    const tenantA = await prisma.tenant.create({
      data: { name: `TA ${suffix}`, nameNormalized: `ta ${suffix}`, slug: `ta-${suffix}`, isEnabled: true },
    });
    const tenantB = await prisma.tenant.create({
      data: { name: `TB ${suffix}`, nameNormalized: `tb ${suffix}`, slug: `tb-${suffix}`, isEnabled: true },
    });
    const restaurantA = await prisma.restaurant.create({
      data: {
        name: `RA ${suffix}`,
        nameNormalized: `ra ${suffix}`,
        slug: `ra-${suffix}`,
        tenantId: tenantA.id,
        receiptFooter: "Thanks",
      },
    });
    const restaurantB = await prisma.restaurant.create({
      data: {
        name: `RB ${suffix}`,
        nameNormalized: `rb ${suffix}`,
        slug: `rb-${suffix}`,
        tenantId: tenantB.id,
        receiptFooter: "Thanks",
      },
    });
    const table = await prisma.table.create({
      data: { number: 1, restaurantId: restaurantA.id, qrToken: `qr-${suffix}` },
    });
    return { tenantA, tenantB, restaurantA, restaurantB, table };
  }

  it("keeps platform scope empty of tenant/restaurant business events", async () => {
    const suffix = `${Date.now()}`;
    const { tenantA, restaurantA } = await seedPair(suffix);
    const now = new Date();
    await prisma.platformAuditEvent.createMany({
      data: [
        {
          occurredAt: now,
          eventKind: "SECURITY",
          severity: "INFO",
          source: "API",
          category: "AUTH",
          action: "PLATFORM_ADMIN_LOGIN_SUCCEEDED",
          outcome: "SUCCESS",
          tenantId: null,
          restaurantId: null,
        },
        {
          occurredAt: now,
          eventKind: "ACTION",
          severity: "INFO",
          source: "API",
          category: "ORDER",
          action: "ORDER_CREATED",
          outcome: "SUCCESS",
          tenantId: tenantA.id,
          restaurantId: restaurantA.id,
        },
        {
          occurredAt: now,
          eventKind: "ACTION",
          severity: "INFO",
          source: "API",
          category: "ORDER",
          action: "ORDER_CREATED",
          outcome: "SUCCESS",
          tenantId: null,
          restaurantId: restaurantA.id,
        },
      ],
    });
    const platform = await queryPlatformAuditEvents({ scope: { kind: "platform" }, limit: 100 });
    assert.ok(platform.events.every((event) => event.tenantId == null && event.restaurantId == null));
    assert.ok(platform.events.some((event) => event.action === "PLATFORM_ADMIN_LOGIN_SUCCEEDED"));
    assert.ok(!platform.events.some((event) => event.action === "ORDER_CREATED"));
  });

  it("includes historical restaurant-scoped rows in tenant logs and never another tenant", async () => {
    const suffix = `hist-${Date.now()}`;
    const { tenantA, tenantB, restaurantA, restaurantB } = await seedPair(suffix);
    const now = new Date();
    await prisma.platformAuditEvent.createMany({
      data: [
        { occurredAt: now, eventKind: "ACTION", severity: "INFO", source: "API", category: "ORDER", action: "ORDER_CREATED", outcome: "SUCCESS", tenantId: tenantA.id, restaurantId: restaurantA.id },
        { occurredAt: now, eventKind: "ACTION", severity: "INFO", source: "API", category: "ORDER", action: "ORDER_CREATED", outcome: "SUCCESS", tenantId: null, restaurantId: restaurantA.id },
        { occurredAt: now, eventKind: "ACTION", severity: "INFO", source: "API", category: "ORDER", action: "ORDER_CREATED", outcome: "SUCCESS", tenantId: tenantB.id, restaurantId: restaurantB.id },
      ],
    });
    const tenant = await queryPlatformAuditEvents({
      scope: { kind: "tenant", tenantId: tenantA.id, restaurantIds: [restaurantA.id] },
      limit: 100,
    });
    const actions = tenant.events.filter((event) => event.action === "ORDER_CREATED");
    assert.equal(actions.length, 2);
    assert.ok(actions.every((event) => event.tenantId === tenantA.id || event.restaurantId === restaurantA.id));
    assert.ok(!actions.some((event) => event.tenantId === tenantB.id || event.restaurantId === restaurantB.id));
  });

  it("forces tenant and restaurant routes and rejects client overrides", async () => {
    const suffix = `api-${Date.now()}`;
    const { tenantA, tenantB, restaurantA, restaurantB } = await seedPair(suffix);
    const token = await createPlatformAdminToken({
      id: "padmin-m5",
      email: "platform@example.test",
      name: "Platform",
    });
    const cookie = `${PLATFORM_ADMIN_COOKIE}=${token}`;
    const previous = process.env.NODE_ENV;
    const env = process.env as { NODE_ENV?: string };
    env.NODE_ENV = "production";

    const override = await tenantLogsGet(
      new NextRequest(`http://dvadtech.in/api/platform/tenants/${tenantA.id}/logs?tenantId=${tenantB.id}`, {
        headers: { host: "dvadtech.in", cookie },
      }),
      { params: Promise.resolve({ tenantId: tenantA.id }) },
    );
    assert.equal(override.status, 400);

    const wrongRestaurant = await restaurantLogsGet(
      new NextRequest(`http://dvadtech.in/api/platform/tenants/${tenantA.id}/restaurants/${restaurantB.id}/logs`, {
        headers: { host: "dvadtech.in", cookie },
      }),
      { params: Promise.resolve({ tenantId: tenantA.id, restaurantId: restaurantB.id }) },
    );
    assert.equal(wrongRestaurant.status, 404);

    const okRestaurant = await restaurantLogsGet(
      new NextRequest(`http://dvadtech.in/api/platform/tenants/${tenantA.id}/restaurants/${restaurantA.id}/logs`, {
        headers: { host: "dvadtech.in", cookie },
      }),
      { params: Promise.resolve({ tenantId: tenantA.id, restaurantId: restaurantA.id }) },
    );
    assert.equal(okRestaurant.status, 200);

    const platformOverride = await platformLogsGet(
      new NextRequest(`http://dvadtech.in/api/platform/logs?tenantId=${tenantA.id}`, {
        headers: { host: "dvadtech.in", cookie },
      }),
      { params: Promise.resolve({}) },
    );
    assert.equal(platformOverride.status, 400);

    const restaurantHost = await platformLogsGet(
      new NextRequest("http://abc.dvadtech.in/api/platform/logs", {
        headers: { host: "abc.dvadtech.in", cookie },
      }),
      { params: Promise.resolve({}) },
    );
    assert.equal(restaurantHost.status, 404);

    if (previous === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previous;
  });

  it("computes command-center revenue from captured payments, not gateway attempt amounts", async () => {
    const suffix = `rev-${Date.now()}`;
    const { tenantA, restaurantA, table } = await seedPair(suffix);
    const order = await prisma.order.create({
      data: {
        orderNumber: 1,
        restaurantId: restaurantA.id,
        tenantId: tenantA.id,
        tableId: table.id,
        status: "SERVED",
        date: todayDateString(),
      },
    });
    await prisma.payment.create({
      data: {
        restaurantId: restaurantA.id,
        tableId: table.id,
        orderId: order.id,
        amount: 250,
        method: "CASH",
        status: "CAPTURED",
      },
    });
    await prisma.gatewayPaymentAttempt.create({
      data: {
        publicToken: `tok-${suffix}`,
        restaurantId: restaurantA.id,
        tableId: table.id,
        orderId: order.id,
        provider: "razorpay",
        amountPaise: 9_999_00,
        status: "PENDING",
        idempotencyKey: `idemp-${suffix}`,
      },
    });
    const token = await createPlatformAdminToken({
      id: "padmin-m5-rev",
      email: "platform-rev@example.test",
      name: "Platform",
    });
    const res = await commandGet(
      new NextRequest("http://dvadtech.in/api/platform/command-center?range=today", {
        headers: { host: "dvadtech.in", cookie: `${PLATFORM_ADMIN_COOKIE}=${token}` },
      }),
      { params: Promise.resolve({}) },
    );
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      restaurants: Array<{ restaurantId: string; revenue: { netCapturedPaise: number }; money: { pendingGatewayAttempts: number } }>;
    };
    const row = json.restaurants.find((item) => item.restaurantId === restaurantA.id);
    assert.ok(row);
    assert.equal(row.revenue.netCapturedPaise, 25000);
    assert.equal(row.money.pendingGatewayAttempts, 1);
  });

  it("records scoped command-center REQUEST access and rejects cross-tenant restaurant", async () => {
    const suffix = `cmd-${Date.now()}`;
    const { tenantA, restaurantA, restaurantB } = await seedPair(suffix);
    const token = await createPlatformAdminToken({
      id: "padmin-m5-cmd",
      email: "platform-cmd@example.test",
      name: "Platform",
    });
    const cookie = `${PLATFORM_ADMIN_COOKIE}=${token}`;
    const previous = process.env.NODE_ENV;
    const env = process.env as { NODE_ENV?: string };
    env.NODE_ENV = "production";
    const started = new Date();

    const platformRes = await commandGet(
      new NextRequest("http://dvadtech.in/api/platform/command-center?range=today", {
        headers: { host: "dvadtech.in", cookie },
      }),
      { params: Promise.resolve({}) },
    );
    assert.equal(platformRes.status, 200);
    const platformAccess = await prisma.platformAuditEvent.findMany({
      where: {
        action: "API_REQUEST",
        route: "/api/platform/command-center",
        occurredAt: { gte: started },
      },
    });
    assert.equal(platformAccess.length, 1);
    assert.equal(platformAccess[0]?.tenantId, null);
    assert.equal(platformAccess[0]?.restaurantId, null);

    const tenantRes = await tenantCommandGet(
      new NextRequest(`http://dvadtech.in/api/platform/tenants/${tenantA.id}/command?range=today`, {
        headers: { host: "dvadtech.in", cookie },
      }),
      { params: Promise.resolve({ tenantId: tenantA.id }) },
    );
    assert.equal(tenantRes.status, 200);
    const tenantAccess = await prisma.platformAuditEvent.findMany({
      where: {
        action: "API_REQUEST",
        tenantId: tenantA.id,
        restaurantId: null,
        route: { contains: "/command" },
        occurredAt: { gte: started },
      },
    });
    assert.equal(tenantAccess.length, 1);
    const platformLogs = await queryPlatformAuditEvents({ scope: { kind: "platform" }, limit: 100 });
    assert.ok(!platformLogs.events.some((event) => event.id === tenantAccess[0]?.id));

    const restaurantRes = await restaurantCommandGet(
      new NextRequest(
        `http://dvadtech.in/api/platform/tenants/${tenantA.id}/restaurants/${restaurantA.id}/command?range=today`,
        { headers: { host: "dvadtech.in", cookie } },
      ),
      { params: Promise.resolve({ tenantId: tenantA.id, restaurantId: restaurantA.id }) },
    );
    assert.equal(restaurantRes.status, 200);
    const restaurantAccess = await prisma.platformAuditEvent.findMany({
      where: {
        action: "API_REQUEST",
        tenantId: tenantA.id,
        restaurantId: restaurantA.id,
        occurredAt: { gte: started },
      },
    });
    assert.equal(restaurantAccess.length, 1);

    const cross = await restaurantCommandGet(
      new NextRequest(
        `http://dvadtech.in/api/platform/tenants/${tenantA.id}/restaurants/${restaurantB.id}/command?range=today`,
        { headers: { host: "dvadtech.in", cookie } },
      ),
      { params: Promise.resolve({ tenantId: tenantA.id, restaurantId: restaurantB.id }) },
    );
    assert.equal(cross.status, 404);
    const body = (await cross.json()) as { restaurants?: unknown; error?: string };
    assert.equal(body.restaurants, undefined);
    const leaked = await prisma.platformAuditEvent.findFirst({
      where: {
        action: "API_REQUEST",
        restaurantId: restaurantB.id,
        occurredAt: { gte: started },
      },
    });
    assert.equal(leaked, null);

    if (previous === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previous;
  });

  it("uses current pending refunds and null reconciliation in money health", async () => {
    const suffix = `money-${Date.now()}`;
    const { tenantA, restaurantA, table } = await seedPair(suffix);
    const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000);
    const order = await prisma.order.create({
      data: {
        orderNumber: 2,
        restaurantId: restaurantA.id,
        tenantId: tenantA.id,
        tableId: table.id,
        status: "SERVED",
        date: todayDateString(),
      },
    });
    const payment = await prisma.payment.create({
      data: {
        restaurantId: restaurantA.id,
        tableId: table.id,
        orderId: order.id,
        amount: 100,
        method: "UPI",
        status: "CAPTURED",
        collectedByUserId: "staff-1",
        collectedByName: "Pat",
      },
    });
    await prisma.payment.create({
      data: {
        restaurantId: restaurantA.id,
        tableId: table.id,
        orderId: order.id,
        amount: 40,
        method: "UPI",
        status: "PENDING",
        collectedByUserId: "staff-1",
        collectedByName: "Pat",
      },
    });
    await prisma.payment.create({
      data: {
        restaurantId: restaurantA.id,
        tableId: table.id,
        orderId: order.id,
        amount: 20,
        method: "UPI",
        status: "REFUNDED",
        refundOfPaymentId: payment.id,
        collectedByUserId: "staff-1",
        collectedByName: "Pat",
      },
    });
    await prisma.gatewayRefundAttempt.create({
      data: {
        restaurantId: restaurantA.id,
        paymentId: payment.id,
        amountPaise: 2000,
        status: "PENDING",
        idempotencyKey: `refund-${suffix}`,
        createdAt: yesterday,
      },
    });
    const token = await createPlatformAdminToken({
      id: "padmin-m5-money",
      email: "platform-money@example.test",
      name: "Platform",
    });
    const res = await commandGet(
      new NextRequest("http://dvadtech.in/api/platform/command-center?range=today", {
        headers: { host: "dvadtech.in", cookie: `${PLATFORM_ADMIN_COOKIE}=${token}` },
      }),
      { params: Promise.resolve({}) },
    );
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      restaurants: Array<{
        restaurantId: string;
        money: {
          refundPending: number;
          reconciliationVariancePaise: number | null;
          cashVariancePaise: number | null;
          health: { level: string };
        };
        staff: { paymentsCollected: number; revenueCollectedPaise: number };
      }>;
    };
    const row = json.restaurants.find((item) => item.restaurantId === restaurantA.id);
    assert.ok(row);
    assert.equal(row.money.refundPending, 1);
    assert.equal(row.money.health.level, "ATTENTION");
    assert.equal(row.money.reconciliationVariancePaise, null);
    assert.equal(row.money.cashVariancePaise, null);
    assert.equal(row.staff.paymentsCollected, 1);
    assert.equal(row.staff.revenueCollectedPaise, 10000);

    await prisma.paymentReconciliation.create({
      data: {
        restaurantId: restaurantA.id,
        tenantId: tenantA.id,
        periodDate: todayDateString(),
        variance: 0,
        cashVariance: 0,
        status: "BALANCED",
      },
    });
    const again = await commandGet(
      new NextRequest("http://dvadtech.in/api/platform/command-center?range=today", {
        headers: { host: "dvadtech.in", cookie: `${PLATFORM_ADMIN_COOKIE}=${token}` },
      }),
      { params: Promise.resolve({}) },
    );
    const againJson = (await again.json()) as typeof json;
    const againRow = againJson.restaurants.find((item) => item.restaurantId === restaurantA.id);
    assert.ok(againRow);
    assert.equal(againRow.money.reconciliationVariancePaise, 0);
    assert.equal(againRow.money.cashVariancePaise, 0);
  });

  it("dedupes one failed request into a single combined error count", async () => {
    const suffix = `rel-${Date.now()}`;
    const { restaurantA } = await seedPair(suffix);
    const now = new Date();
    const requestId = `req-${suffix}`;
    await prisma.platformAuditEvent.createMany({
      data: [
        {
          occurredAt: now,
          eventKind: "ERROR",
          severity: "ERROR",
          source: "API",
          category: "SYSTEM",
          action: "REQUEST_FAILED",
          outcome: "FAILED",
          requestId,
          restaurantId: restaurantA.id,
          httpStatus: 500,
          errorFingerprint: `fp-${suffix}`,
        },
        {
          occurredAt: now,
          eventKind: "REQUEST",
          severity: "ERROR",
          source: "API",
          category: "SYSTEM",
          action: "API_REQUEST",
          outcome: "FAILED",
          requestId,
          restaurantId: restaurantA.id,
          httpStatus: 500,
          errorFingerprint: `fp-${suffix}`,
        },
        {
          occurredAt: now,
          eventKind: "SECURITY",
          severity: "WARN",
          source: "API",
          category: "SECURITY",
          action: "PERMISSION_DENIED",
          outcome: "DENIED",
          requestId: `sec-${suffix}`,
          restaurantId: restaurantA.id,
        },
        {
          occurredAt: now,
          eventKind: "REQUEST",
          severity: "WARN",
          source: "API",
          category: "SYSTEM",
          action: "API_REQUEST",
          outcome: "DENIED",
          requestId: `sec-${suffix}`,
          restaurantId: restaurantA.id,
          httpStatus: 403,
        },
      ],
    });
    const map = await loadReliabilityByRestaurant({
      restaurantIds: [restaurantA.id],
      from: new Date(now.getTime() - 1000),
      to: new Date(now.getTime() + 1000),
    });
    const counts = map.get(restaurantA.id);
    assert.ok(counts);
    assert.equal(counts.requestFailed, 1);
    assert.equal(counts.http5xx, 1);
    assert.equal(counts.failedRequests, 1);
    assert.equal(counts.permissionDenied, 1);
    assert.equal(counts.securityDenials, 1);
  });
});

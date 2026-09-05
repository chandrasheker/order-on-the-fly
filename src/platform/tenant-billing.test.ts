import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";

const dbPath = path.join(os.tmpdir(), `tabletap-billing-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_URL = `file:${dbPath}`;
process.env.JWT_SECRET = process.env.JWT_SECRET || "billing-test-jwt-secret-must-be-32!!";
process.env.TENANT_BASE_DOMAIN = "dvadtech.in";

let prisma: PrismaClient;
let expireDemoIfNeeded: typeof import("@/lib/tenant-billing-service").expireDemoIfNeeded;
let resolveBillingState: typeof import("@/lib/tenant-billing-service").resolveBillingState;
let serializeTenantBilling: typeof import("@/lib/tenant-billing-service").serializeTenantBilling;
let activateDemoPack: typeof import("@/lib/tenant-billing-service").activateDemoPack;
let setTenantPaidPlan: typeof import("@/lib/tenant-billing-service").setTenantPaidPlan;

describe("tenant billing state", () => {
  it("lets an unused-demo tenant enable the pack and not pick a paid plan yet", async () => {
    const { resolveBillingState } = await import("@/lib/tenant-billing-service");
    const state = resolveBillingState({
      demoPackUsedAt: null,
      demoExpiresAt: null,
      subscriptionStatus: "TRIAL",
    });
    assert.equal(state.canEnableDemo, true);
    assert.equal(state.isDemoActive, false);
    assert.equal(state.canSelectPlan, false);
  });

  it("locks paid plan changes while the demo pack is still active", async () => {
    const { resolveBillingState } = await import("@/lib/tenant-billing-service");
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    const state = resolveBillingState({
      demoPackUsedAt: new Date(),
      demoExpiresAt: expires,
      subscriptionStatus: "DEMO",
    });
    assert.equal(state.isDemoActive, true);
    assert.equal(state.canEnableDemo, false);
    assert.equal(state.canSelectPlan, false);
    assert.match(state.billingLockedReason ?? "", /Demo pack active/);
  });

  it("unlocks paid plans after the demo ends", async () => {
    const { resolveBillingState } = await import("@/lib/tenant-billing-service");
    const state = resolveBillingState({
      demoPackUsedAt: new Date("2026-01-01T00:00:00.000Z"),
      demoExpiresAt: new Date("2026-01-08T00:00:00.000Z"),
      subscriptionStatus: "EXPIRED",
    });
    assert.equal(state.isDemoActive, false);
    assert.equal(state.canEnableDemo, false);
    assert.equal(state.canSelectPlan, true);
  });
});

describe("tenant billing persistence", () => {
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
      expireDemoIfNeeded,
      resolveBillingState,
      serializeTenantBilling,
      activateDemoPack,
      setTenantPaidPlan,
    } = await import("@/lib/tenant-billing-service"));
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("serializes one tenant without requiring every other tenant to load", async () => {
    const suffix = `${Date.now()}`;
    const tenant = await prisma.tenant.create({
      data: {
        name: `Billing ${suffix}`,
        nameNormalized: `billing ${suffix}`,
        slug: `billing-${suffix}`,
        plan: "STARTER",
        subscriptionStatus: "TRIAL",
        billingEmail: `billing-${suffix}@example.com`,
        isEnabled: true,
      },
    });
    await prisma.restaurant.create({
      data: {
        name: `Cafe ${suffix}`,
        nameNormalized: `cafe ${suffix}`,
        slug: `cafe-${suffix}`,
        tenantId: tenant.id,
        receiptFooter: "Thanks",
      },
    });
    await prisma.tenant.create({
      data: {
        name: `Other ${suffix}`,
        nameNormalized: `other ${suffix}`,
        slug: `other-${suffix}`,
        isEnabled: true,
      },
    });

    const loaded = await expireDemoIfNeeded(tenant.id);
    assert.ok(loaded);
    const payload = serializeTenantBilling(loaded);
    assert.equal(payload.id, tenant.id);
    assert.equal(payload.restaurants.length, 1);
    assert.equal(payload.billing.canEnableDemo, true);
    assert.doesNotThrow(() => JSON.stringify({ tenant: payload }));
  });

  it("expires an elapsed demo and then allows a paid plan", async () => {
    const suffix = `exp-${Date.now()}`;
    const ended = new Date(Date.now() - 60_000);
    const tenant = await prisma.tenant.create({
      data: {
        name: `Expired ${suffix}`,
        nameNormalized: `expired ${suffix}`,
        slug: `expired-${suffix}`,
        plan: "PRO",
        subscriptionStatus: "DEMO",
        demoPackUsedAt: new Date(ended.getTime() - 7 * 86400000),
        demoExpiresAt: ended,
        isEnabled: true,
      },
    });

    const expired = await expireDemoIfNeeded(tenant.id);
    assert.ok(expired);
    assert.equal(expired.subscriptionStatus, "EXPIRED");
    const state = resolveBillingState(expired);
    assert.equal(state.isDemoActive, false);
    assert.equal(state.canSelectPlan, true);

    const paid = await setTenantPaidPlan(tenant.id, "ENTERPRISE");
    assert.ok(paid);
    assert.equal(paid.plan, "ENTERPRISE");
    assert.equal(paid.subscriptionStatus, "ACTIVE");
  });

  it("refuses a second demo pack and refuses a plan change while demo is active", async () => {
    const suffix = `demo-${Date.now()}`;
    const tenant = await prisma.tenant.create({
      data: {
        name: `Demo ${suffix}`,
        nameNormalized: `demo ${suffix}`,
        slug: `demo-${suffix}`,
        isEnabled: true,
      },
    });

    const activated = await activateDemoPack(tenant.id);
    assert.ok(activated);
    assert.equal(activated.subscriptionStatus, "DEMO");
    const state = resolveBillingState(activated);
    assert.equal(state.isDemoActive, true);
    assert.equal(state.canSelectPlan, false);

    await assert.rejects(() => activateDemoPack(tenant.id), /already used/);
    await assert.rejects(() => setTenantPaidPlan(tenant.id, "PRO"), /demo pack is still active/);
  });
});

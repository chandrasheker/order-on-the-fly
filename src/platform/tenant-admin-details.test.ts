import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { NextRequest } from "next/server";
import type { PrismaClient } from "@/generated/prisma/client";

const dbPath = path.join(os.tmpdir(), `tabletap-tadmin-details-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_URL = `file:${dbPath}`;
process.env.JWT_SECRET = process.env.JWT_SECRET || "tadmin-details-jwt-secret-must-be-32";
process.env.TENANT_BASE_DOMAIN = "dvadtech.in";

let prisma: PrismaClient;
let signupTenantWithRestaurants: typeof import("@/lib/tenant-onboarding-service").signupTenantWithRestaurants;
let getTenantOverview: typeof import("@/lib/tenant-onboarding-service").getTenantOverview;
let presentTenantAdminOverview: typeof import("@/lib/tenant-admin-details").presentTenantAdminOverview;
let listTenantAdminStaff: typeof import("@/lib/tenant-admin-details").listTenantAdminStaff;
let listTenantAdminFeatures: typeof import("@/lib/tenant-admin-details").listTenantAdminFeatures;
let getCommandCenter: typeof import("@/platform/command-center/metrics-service").getCommandCenter;
let resolveTimeRange: typeof import("@/platform/command-center/time-range").resolveTimeRange;
let createTenantAdminToken: typeof import("@/lib/auth").createTenantAdminToken;
let createPlatformAdminToken: typeof import("@/lib/auth").createPlatformAdminToken;
let TENANT_ADMIN_COOKIE: typeof import("@/lib/auth").TENANT_ADMIN_COOKIE;
let STAFF_SESSION_COOKIE: typeof import("@/lib/auth").STAFF_SESSION_COOKIE;
let PLATFORM_ADMIN_COOKIE: typeof import("@/lib/auth").PLATFORM_ADMIN_COOKIE;
let overviewGet: typeof import("@/app/api/tenant-admin/overview/route").GET;
let commandGet: typeof import("@/app/api/tenant-admin/command/route").GET;
let logsGet: typeof import("@/app/api/tenant-admin/logs/route").GET;
let staffGet: typeof import("@/app/api/tenant-admin/staff/route").GET;
let featuresGet: typeof import("@/app/api/tenant-admin/features/route").GET;
let staffLogin: typeof import("@/app/api/auth/login/route").POST;

const suffix = `${Date.now()}`;
const sharedPassword = "shared12";
const emptyRouteContext = { params: Promise.resolve({}) };

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
  ({ signupTenantWithRestaurants, getTenantOverview } = await import("@/lib/tenant-onboarding-service"));
  ({ presentTenantAdminOverview, listTenantAdminStaff, listTenantAdminFeatures } = await import(
    "@/lib/tenant-admin-details"
  ));
  ({ getCommandCenter } = await import("@/platform/command-center/metrics-service"));
  ({ resolveTimeRange } = await import("@/platform/command-center/time-range"));
  ({
    createTenantAdminToken,
    createPlatformAdminToken,
    TENANT_ADMIN_COOKIE,
    STAFF_SESSION_COOKIE,
    PLATFORM_ADMIN_COOKIE,
  } = await import("@/lib/auth"));
  ({ GET: overviewGet } = await import("@/app/api/tenant-admin/overview/route"));
  ({ GET: commandGet } = await import("@/app/api/tenant-admin/command/route"));
  ({ GET: logsGet } = await import("@/app/api/tenant-admin/logs/route"));
  ({ GET: staffGet } = await import("@/app/api/tenant-admin/staff/route"));
  ({ GET: featuresGet } = await import("@/app/api/tenant-admin/features/route"));
  ({ POST: staffLogin } = await import("@/app/api/auth/login/route"));
});

after(async () => {
  if (prisma) await prisma.$disconnect().catch(() => undefined);
  for (const extra of ["", "-wal", "-shm", "-journal"]) {
    fs.rmSync(`${dbPath}${extra}`, { force: true });
  }
});

function tenantRequest(url: string, host: string, cookie?: string) {
  return new NextRequest(url, {
    headers: {
      host,
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
  });
}

async function createTenant(label: string, restaurants: Array<{ name: string }>) {
  const created = await signupTenantWithRestaurants({
    tenantName: `${label}${suffix}`,
    billingEmail: `billing-${label.toLowerCase()}${suffix}@example.com`,
    restaurants: restaurants.map((restaurant, index) => ({
      name: restaurant.name,
      ownerEmail: `owner-${label.toLowerCase()}-${index}${suffix}@example.com`,
      ownerName: "Chandrasheker",
      ownerPassword: sharedPassword,
    })),
  });
  const host =
    created.restaurants.length === 1
      ? `${created.restaurants[0].restaurant.slug}.dvadtech.in`
      : `${created.tenant.slug}.dvadtech.in`;
  const token = await createTenantAdminToken({
    id: created.tenantAdmin.id,
    email: created.tenantAdmin.email,
    name: created.tenantAdmin.name,
    tenantId: created.tenant.id,
    authVersion: created.tenantAdmin.authVersion,
  });
  return { created, host, token, cookie: `${TENANT_ADMIN_COOKIE}=${token}` };
}

function secretHits(payload: unknown) {
  const blob = JSON.stringify(payload);
  return [
    "passwordHash",
    "plainPassword",
    "paymentGatewaySecretEnc",
    "paymentWebhookSecret",
    "paymentWebhookSecretEnc",
    "aggregatorWebhookSecret",
    "externalBillingId",
    "SECRET-GATEWAY",
    "SECRET-WEBHOOK",
    "visible-should-not-leak",
    "cus_secret_billing",
  ].filter((needle) => blob.includes(needle));
}

describe("tenant administrator tenant details", () => {
  it("exposes platform-like tenant details without secrets", async () => {
    const { created } = await createTenant("Details", [{ name: `Cafe${suffix}` }]);
    const restaurantId = created.restaurants[0].restaurant.id;
    const owner = await prisma.user.findFirst({ where: { restaurantId } });
    assert.ok(owner);

    await prisma.tenant.update({
      where: { id: created.tenant.id },
      data: { externalBillingId: "cus_secret_billing" },
    });
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        serviceMode: "HYBRID",
        pickupLocationLabel: "Counter 2",
        hybridDefaultFulfillment: "SELF_PICKUP",
        paymentGatewayProvider: "RAZORPAY",
        paymentGatewayKeyId: "rzp_test_xxx",
        paymentGatewaySecretEnc: "SECRET-GATEWAY",
        paymentWebhookSecret: "SECRET-WEBHOOK",
        aggregatorWebhookSecret: "SECRET-AGG",
        upiVpa: "shop@upi",
        upiMerchantName: "Cafe UPI",
        receiptAddress: "12 MG Road",
        receiptPhone: "9999999999",
        receiptGstEnabled: true,
        receiptGstin: "29AAAAA0000A1Z5",
      },
    });
    const overview = await getTenantOverview(created.tenant.id);
    assert.ok(overview);
    assert.equal(overview.tenant.billingEmail, created.tenant.billingEmail);
    assert.ok(overview.tenant.createdAt);
    assert.ok(overview.subscriptions.length >= 1);
    assert.ok(overview.hostSlugs.length >= 1);
    assert.equal(overview.admins[0]?.email, created.tenantAdmin.email);
    assert.equal(overview.restaurants[0]?.serviceMode, "HYBRID");
    assert.equal(overview.restaurants[0]?.pickupLocationLabel, "Counter 2");
    assert.equal(overview.restaurants[0]?.upiVpa, "shop@upi");
    assert.equal(overview.restaurants[0]?.paymentGatewayProvider, "RAZORPAY");
    assert.ok(overview.restaurants[0]?.staff.some((row) => row.email === owner.email));
    assert.ok(overview.restaurants[0]?.branches.length >= 1);
    assert.equal("externalBillingId" in overview.tenant, false);
    assert.equal(secretHits(overview).length, 0);

    const presented = presentTenantAdminOverview(overview);
    assert.ok(presented.restaurants[0]?.url.includes(overview.restaurants[0].slug));
    assert.equal(secretHits(presented).length, 0);

    const staff = await listTenantAdminStaff(created.tenant.id);
    assert.ok(staff[0]?.slots.some((slot) => slot.email === owner.email));
    assert.equal(secretHits(staff).length, 0);

    const features = await listTenantAdminFeatures(created.tenant.id);
    assert.ok(features[0]?.features.some((feature) => feature.key === "qr_ordering"));
    assert.equal(secretHits(features).length, 0);
  });

  it("uses tenant-safe command hrefs and keeps platform hrefs unchanged by default", async () => {
    const { created } = await createTenant("Hrefs", [{ name: `HrefCafe${suffix}` }]);
    const range = resolveTimeRange({ preset: "today" });
    const platform = await getCommandCenter({ tenantId: created.tenant.id, range });
    const tenant = await getCommandCenter({
      tenantId: created.tenant.id,
      range,
      linkStyle: "tenant",
    });
    const restaurantId = created.restaurants[0].restaurant.id;
    assert.match(platform.restaurants[0].hrefs.overview, new RegExp(`/platform/tenants/${created.tenant.id}/restaurants/${restaurantId}`));
    assert.equal(tenant.restaurants[0].hrefs.overview, `/tenant?tab=restaurants&restaurantId=${restaurantId}`);
    assert.equal(tenant.restaurants[0].hrefs.logs.includes("/platform"), false);
    assert.equal(tenant.restaurants[0].hrefs.security, "/tenant?tab=logs&preset=security");
  });

  it("scopes TenantAdmin APIs to the signed-in tenant and rejects outsiders", async () => {
    const a = await createTenant("ScopeA", [{ name: `North${suffix}` }]);
    const b = await createTenant("ScopeB", [{ name: `South${suffix}` }]);
    const platformCookie = `${PLATFORM_ADMIN_COOKIE}=${await createPlatformAdminToken({
      id: "padmin-details",
      email: `padmin-details${suffix}@example.com`,
      name: "Platform",
    })}`;
    const staff = await staffLogin(
      new NextRequest(`http://${a.host}/api/auth/login`, {
        method: "POST",
        headers: { host: a.host, "content-type": "application/json" },
        body: JSON.stringify({
          email: a.created.restaurants[0].owner.email,
          password: sharedPassword,
        }),
      }),
      emptyRouteContext,
    );
    const staffCookie = staff.headers.get("set-cookie") ?? "";
    const staffMatch = staffCookie.match(new RegExp(`${STAFF_SESSION_COOKIE}=([^;]+)`));

    const overview = await overviewGet(
      tenantRequest(`http://${a.host}/api/tenant-admin/overview`, a.host, a.cookie),
      emptyRouteContext,
    );
    assert.equal(overview.status, 200);
    const overviewJson = (await overview.json()) as {
      tenant: { id: string; billingEmail: string };
      restaurants: Array<{ id: string; staff: Array<{ email: string }> }>;
    };
    assert.equal(overviewJson.tenant.id, a.created.tenant.id);
    assert.equal(overviewJson.tenant.billingEmail, a.created.tenant.billingEmail);
    assert.equal(
      overviewJson.restaurants.some((row) => row.id === b.created.restaurants[0].restaurant.id),
      false,
    );
    assert.equal(secretHits(overviewJson).length, 0);

    const command = await commandGet(
      tenantRequest(`http://${a.host}/api/tenant-admin/command?range=today`, a.host, a.cookie),
      emptyRouteContext,
    );
    assert.equal(command.status, 200);
    const commandJson = (await command.json()) as {
      restaurants: Array<{ restaurantId: string; hrefs: { overview: string } }>;
    };
    assert.deepEqual(
      commandJson.restaurants.map((row) => row.restaurantId),
      [a.created.restaurants[0].restaurant.id],
    );
    assert.match(commandJson.restaurants[0].hrefs.overview, /^\/tenant\?/);

    const logs = await logsGet(
      tenantRequest(`http://${a.host}/api/tenant-admin/logs`, a.host, a.cookie),
      emptyRouteContext,
    );
    assert.equal(logs.status, 200);
    const logsJson = (await logs.json()) as { tenant: { id: string }; restaurants: Array<{ id: string }> };
    assert.equal(logsJson.tenant.id, a.created.tenant.id);
    assert.equal(
      logsJson.restaurants.some((row) => row.id === b.created.restaurants[0].restaurant.id),
      false,
    );

    const override = await logsGet(
      tenantRequest(
        `http://${a.host}/api/tenant-admin/logs?tenantId=${b.created.tenant.id}`,
        a.host,
        a.cookie,
      ),
      emptyRouteContext,
    );
    assert.equal(override.status, 400);

    const foreignRestaurant = await logsGet(
      tenantRequest(
        `http://${a.host}/api/tenant-admin/logs?restaurantId=${b.created.restaurants[0].restaurant.id}`,
        a.host,
        a.cookie,
      ),
      emptyRouteContext,
    );
    assert.equal(foreignRestaurant.status, 404);

    const staffRes = await staffGet(
      tenantRequest(`http://${a.host}/api/tenant-admin/staff`, a.host, a.cookie),
      emptyRouteContext,
    );
    const featuresRes = await featuresGet(
      tenantRequest(`http://${a.host}/api/tenant-admin/features`, a.host, a.cookie),
      emptyRouteContext,
    );
    assert.equal(staffRes.status, 200);
    assert.equal(featuresRes.status, 200);
    assert.equal(secretHits(await staffRes.json()).length, 0);
    assert.equal(secretHits(await featuresRes.json()).length, 0);

    const otherHost = await overviewGet(
      tenantRequest(`http://${b.host}/api/tenant-admin/overview`, b.host, a.cookie),
      emptyRouteContext,
    );
    const anonymous = await overviewGet(
      tenantRequest(`http://${a.host}/api/tenant-admin/overview`, a.host),
      emptyRouteContext,
    );
    const asStaff = await overviewGet(
      tenantRequest(
        `http://${a.host}/api/tenant-admin/overview`,
        a.host,
        staffMatch ? `${STAFF_SESSION_COOKIE}=${staffMatch[1]}` : "",
      ),
      emptyRouteContext,
    );
    const asPlatform = await commandGet(
      tenantRequest(`http://${a.host}/api/tenant-admin/command?range=today`, a.host, platformCookie),
      emptyRouteContext,
    );
    assert.equal(otherHost.status, 401);
    assert.equal(anonymous.status, 401);
    assert.equal(asStaff.status, 401);
    assert.equal(asPlatform.status, 401);
  });
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { NextRequest } from "next/server";
import type { PrismaClient } from "@/generated/prisma/client";

const dbPath = path.join(os.tmpdir(), `tabletap-staff-pw-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_URL = `file:${dbPath}`;
process.env.JWT_SECRET = process.env.JWT_SECRET || "staff-pw-jwt-secret-must-be-32-chars!!";
process.env.TENANT_BASE_DOMAIN = "dvadtech.in";

let prisma: PrismaClient;
let signupTenantWithRestaurants: typeof import("@/lib/tenant-onboarding-service").signupTenantWithRestaurants;
let addRestaurantToTenant: typeof import("@/lib/tenant-onboarding-service").addRestaurantToTenant;
let resetTenantAdminPassword: typeof import("@/lib/tenant-admin-password").resetTenantAdminPassword;
let verifyPassword: typeof import("@/lib/auth").verifyPassword;
let createToken: typeof import("@/lib/auth").createToken;
let verifyToken: typeof import("@/lib/auth").verifyToken;
let staffTokenAuthVersion: typeof import("@/lib/auth").staffTokenAuthVersion;
let createPlatformAdminToken: typeof import("@/lib/auth").createPlatformAdminToken;
let PLATFORM_ADMIN_COOKIE: typeof import("@/lib/auth").PLATFORM_ADMIN_COOKIE;
let staffLogin: typeof import("@/app/api/auth/login/route").POST;
let staffExportGet: typeof import("@/app/api/platform/staff-export/route").GET;
let staffExportPost: typeof import("@/app/api/platform/staff-export/route").POST;

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
  ({ signupTenantWithRestaurants, addRestaurantToTenant } = await import("@/lib/tenant-onboarding-service"));
  ({ resetTenantAdminPassword } = await import("@/lib/tenant-admin-password"));
  ({
    verifyPassword,
    createToken,
    verifyToken,
    staffTokenAuthVersion,
    createPlatformAdminToken,
    PLATFORM_ADMIN_COOKIE,
  } = await import("@/lib/auth"));
  ({ POST: staffLogin } = await import("@/app/api/auth/login/route"));
  ({ GET: staffExportGet, POST: staffExportPost } = await import("@/app/api/platform/staff-export/route"));
});

after(async () => {
  if (prisma) await prisma.$disconnect().catch(() => undefined);
  for (const extra of ["", "-wal", "-shm", "-journal"]) {
    fs.rmSync(`${dbPath}${extra}`, { force: true });
  }
});

async function createRestaurant(label: string) {
  const email = `owner-${label.toLowerCase()}${suffix}@example.com`;
  const created = await signupTenantWithRestaurants({
    tenantName: `${label}${suffix}`,
    billingEmail: `billing-${label.toLowerCase()}${suffix}@example.com`,
    restaurants: [
      {
        name: `${label}${suffix}`,
        ownerEmail: email,
        ownerName: "Owner",
        ownerPassword: sharedPassword,
      },
    ],
  });
  const restaurant = created.restaurants[0].restaurant;
  const owner = created.restaurants[0].owner;
  return { created, restaurant, owner, email, host: `${restaurant.slug}.dvadtech.in` };
}

function userColumns() {
  return prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("User")`);
}

function platformCookie() {
  return createPlatformAdminToken({
    id: "padmin-staff-pw",
    email: "platform@example.test",
    name: "Platform",
  }).then((token) => `${PLATFORM_ADMIN_COOKIE}=${token}`);
}

function staffRequest(url: string, host: string, init?: { method?: string; cookie?: string; body?: unknown }) {
  return new NextRequest(url, {
    method: init?.method ?? "GET",
    headers: {
      host,
      "content-type": "application/json",
      ...(init?.cookie ? { cookie: init.cookie } : {}),
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

describe("staff password storage and session revocation", () => {
  it("has no plaintext password column after migration and stores only bcrypt hashes", async () => {
    const cols = await userColumns();
    const names = cols.map((col) => col.name);
    assert.equal(names.includes("plainPassword"), false);
    assert.equal(names.includes("authVersion"), true);
    assert.equal(names.includes("passwordHash"), true);

    const sqliteSql = fs.readFileSync(
      path.join(process.cwd(), "prisma/migrations/20260910141000_remove_user_plain_password/migration.sql"),
      "utf8",
    );
    assert.match(sqliteSql, /DROP COLUMN "plainPassword"/);
    assert.match(sqliteSql, /ADD COLUMN "authVersion"/);
    const postgresSql = fs.readFileSync(
      path.join(process.cwd(), "prisma/migrations-postgres/000026_remove_user_plain_password/migration.sql"),
      "utf8",
    );
    assert.match(postgresSql, /DROP COLUMN IF EXISTS "plainPassword"/);
    const postgresSchema = fs.readFileSync(path.join(process.cwd(), "prisma/schema.postgres.prisma"), "utf8");
    assert.equal(postgresSchema.includes("plainPassword"), false);
    assert.match(postgresSchema, /authVersion\s+Int\s+@default\(0\)/);

    const { owner } = await createRestaurant("HashOnly");
    const stored = await prisma.user.findUnique({ where: { id: owner.id } });
    assert.ok(stored);
    assert.equal(Object.prototype.hasOwnProperty.call(stored, "plainPassword"), false);
    assert.match(stored.passwordHash, /^\$2[aby]\$/);
    assert.equal(await verifyPassword(sharedPassword, stored.passwordHash), true);
    assert.equal(stored.authVersion, 0);
  });

  it("rejects missing or weak owner passwords and has no known default fallback", async () => {
    const onboarding = fs.readFileSync(path.join(process.cwd(), "src/lib/tenant-onboarding-service.ts"), "utf8");
    assert.equal(onboarding.includes("changeme123"), false);
    assert.equal(/ownerPassword\s*\|\|/.test(onboarding), false);

    const { created } = await createRestaurant("NeedPw");
    await assert.rejects(
      () =>
        addRestaurantToTenant(created.tenant.id, {
          name: `MissingPw${suffix}`,
          ownerEmail: `missing-pw${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "",
        }),
      /Owner password is required/,
    );
    await assert.rejects(
      () =>
        addRestaurantToTenant(created.tenant.id, {
          name: `WeakPw${suffix}`,
          ownerEmail: `weak-pw${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "123",
        }),
      /at least 6 characters/,
    );

    await assert.rejects(
      () =>
        signupTenantWithRestaurants({
          tenantName: `SignupWeak${suffix}`,
          billingEmail: `signup-weak${suffix}@example.com`,
          restaurants: [
            {
              name: `SignupWeak${suffix}`,
              ownerEmail: `signup-weak${suffix}@example.com`,
              ownerName: "Owner",
              ownerPassword: "",
            },
          ],
        }),
      /Owner password is required/,
    );
  });

  it("reset and export returns a new password once, stores only its hash, and revokes old JWTs", async () => {
    const { restaurant, owner, email, host } = await createRestaurant("ResetExp");
    const before = await prisma.user.findUnique({ where: { id: owner.id } });
    assert.ok(before);
    const oldToken = await createToken(
      {
        id: owner.id,
        email: owner.email,
        name: owner.name,
        role: owner.role,
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        restaurantSlug: restaurant.slug,
      },
      before.authVersion,
    );
    assert.equal(staffTokenAuthVersion((await verifyToken(oldToken)) ?? {}), before.authVersion);

    const oldLogin = await staffLogin(
      staffRequest(`http://${host}/api/auth/login`, host, {
        method: "POST",
        body: { email, password: sharedPassword },
      }),
      emptyRouteContext,
    );
    assert.equal(oldLogin.status, 200);

    const getBlocked = await staffExportGet(
      staffRequest("http://dvadtech.in/api/platform/staff-export?restaurantId=x", "dvadtech.in"),
      emptyRouteContext,
    );
    assert.equal(getBlocked.status, 405);

    const cookie = await platformCookie();
    const exported = await staffExportPost(
      staffRequest("http://dvadtech.in/api/platform/staff-export", "dvadtech.in", {
        method: "POST",
        cookie,
        body: { restaurantId: restaurant.id },
      }),
      emptyRouteContext,
    );
    assert.equal(exported.status, 200);
    assert.equal(exported.headers.get("cache-control"), "no-store");
    const csv = await exported.text();
    assert.match(csv, /Password/);
    const ownerRow = csv.split("\n").find((line) => line.includes(email));
    assert.ok(ownerRow);
    const newPassword = ownerRow.split(",").at(-1)?.replace(/^"|"$/g, "") ?? "";
    assert.ok(newPassword.length >= 6);
    assert.notEqual(newPassword, sharedPassword);

    const after = await prisma.user.findUnique({ where: { id: owner.id } });
    assert.ok(after);
    assert.equal(Object.prototype.hasOwnProperty.call(after, "plainPassword"), false);
    assert.equal(csv.includes(after.passwordHash), false);
    assert.equal(await verifyPassword(sharedPassword, after.passwordHash), false);
    assert.equal(await verifyPassword(newPassword, after.passwordHash), true);
    assert.equal(after.authVersion, before.authVersion + 1);
    assert.notEqual(staffTokenAuthVersion((await verifyToken(oldToken)) ?? {}), after.authVersion);

    const staleLogin = await staffLogin(
      staffRequest(`http://${host}/api/auth/login`, host, {
        method: "POST",
        body: { email, password: sharedPassword },
      }),
      emptyRouteContext,
    );
    assert.equal(staleLogin.status, 401);

    const newLogin = await staffLogin(
      staffRequest(`http://${host}/api/auth/login`, host, {
        method: "POST",
        body: { email, password: newPassword },
      }),
      emptyRouteContext,
    );
    assert.equal(newLogin.status, 200);
    const newPayload = await verifyToken(
      (newLogin.headers.get("set-cookie") ?? "").match(/tabletap_session=([^;]+)/)?.[1] ?? "",
    );
    assert.ok(newPayload);
    assert.equal(staffTokenAuthVersion(newPayload), after.authVersion);

    const events = await prisma.platformAuditEvent.findMany({
      where: { restaurantId: restaurant.id },
    });
    const blob = JSON.stringify(events);
    assert.equal(blob.includes(newPassword), false);
    assert.equal(blob.includes(sharedPassword), false);
    assert.equal(blob.includes(after.passwordHash), false);
  });

  it("keeps TenantAdmin and restaurant OWNER password resets independent", async () => {
    const { created, owner, email, host } = await createRestaurant("Separate");
    const tenantAdmin = created.tenantAdmin;
    const ownerBefore = await prisma.user.findUnique({ where: { id: owner.id } });
    const adminBefore = await prisma.tenantAdmin.findUnique({ where: { id: tenantAdmin.id } });
    assert.ok(ownerBefore && adminBefore);

    await resetTenantAdminPassword({
      tenantId: created.tenant.id,
      tenantAdminId: tenantAdmin.id,
      newPassword: "adminpw12",
      actorPlatformAdminId: "padmin-separate",
    });
    const ownerAfterAdminReset = await prisma.user.findUnique({ where: { id: owner.id } });
    const adminAfterReset = await prisma.tenantAdmin.findUnique({ where: { id: tenantAdmin.id } });
    assert.equal(ownerAfterAdminReset?.passwordHash, ownerBefore.passwordHash);
    assert.equal(ownerAfterAdminReset?.authVersion, ownerBefore.authVersion);
    assert.notEqual(adminAfterReset?.passwordHash, adminBefore.passwordHash);
    assert.equal(adminAfterReset?.authVersion, adminBefore.authVersion + 1);

    const stillOwner = await staffLogin(
      staffRequest(`http://${host}/api/auth/login`, host, {
        method: "POST",
        body: { email, password: sharedPassword },
      }),
      emptyRouteContext,
    );
    assert.equal(stillOwner.status, 200);

    const cookie = await platformCookie();
    const exported = await staffExportPost(
      staffRequest("http://dvadtech.in/api/platform/staff-export", "dvadtech.in", {
        method: "POST",
        cookie,
        body: { restaurantId: created.restaurants[0].restaurant.id },
      }),
      emptyRouteContext,
    );
    assert.equal(exported.status, 200);
    const adminAfterStaffReset = await prisma.tenantAdmin.findUnique({ where: { id: tenantAdmin.id } });
    assert.equal(adminAfterStaffReset?.passwordHash, adminAfterReset?.passwordHash);
    assert.equal(adminAfterStaffReset?.authVersion, adminAfterReset?.authVersion);

    const ownerLogin = await staffLogin(
      staffRequest(`http://${host}/api/auth/login`, host, {
        method: "POST",
        body: { email, password: sharedPassword },
      }),
      emptyRouteContext,
    );
    assert.equal(ownerLogin.status, 401);
  });
});

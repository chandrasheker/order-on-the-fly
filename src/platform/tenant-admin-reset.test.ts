import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { NextRequest } from "next/server";
import type { PrismaClient } from "@/generated/prisma/client";

const dbPath = path.join(os.tmpdir(), `tabletap-tadmin-reset-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_URL = `file:${dbPath}`;
process.env.JWT_SECRET = process.env.JWT_SECRET || "tadmin-reset-jwt-secret-must-be-32-chars";
process.env.TENANT_BASE_DOMAIN = "dvadtech.in";

let prisma: PrismaClient;
let signupTenantWithRestaurants: typeof import("@/lib/tenant-onboarding-service").signupTenantWithRestaurants;
let resetTenantAdminPassword: typeof import("@/lib/tenant-admin-password").resetTenantAdminPassword;
let createTenantAdminToken: typeof import("@/lib/auth").createTenantAdminToken;
let verifyTenantAdminToken: typeof import("@/lib/auth").verifyTenantAdminToken;
let TENANT_ADMIN_COOKIE: typeof import("@/lib/auth").TENANT_ADMIN_COOKIE;
let STAFF_SESSION_COOKIE: typeof import("@/lib/auth").STAFF_SESSION_COOKIE;
let tenantsPatch: typeof import("@/app/api/platform/tenants/route").PATCH;
let tenantAdminLogin: typeof import("@/app/api/tenant-admin/auth/login/route").POST;
let staffLogin: typeof import("@/app/api/auth/login/route").POST;

const suffix = `${Date.now()}`;
const sharedPassword = "shared12";
const nextPassword = "newpass12";
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
  ({ signupTenantWithRestaurants } = await import("@/lib/tenant-onboarding-service"));
  ({ resetTenantAdminPassword } = await import("@/lib/tenant-admin-password"));
  ({
    createTenantAdminToken,
    verifyTenantAdminToken,
    TENANT_ADMIN_COOKIE,
    STAFF_SESSION_COOKIE,
  } = await import("@/lib/auth"));
  ({ PATCH: tenantsPatch } = await import("@/app/api/platform/tenants/route"));
  ({ POST: tenantAdminLogin } = await import("@/app/api/tenant-admin/auth/login/route"));
  ({ POST: staffLogin } = await import("@/app/api/auth/login/route"));
});

after(async () => {
  if (prisma) await prisma.$disconnect().catch(() => undefined);
  for (const extra of ["", "-wal", "-shm", "-journal"]) {
    fs.rmSync(`${dbPath}${extra}`, { force: true });
  }
});

function platformRequest(body: Record<string, unknown>, cookie?: string) {
  return new NextRequest("http://dvadtech.in/api/platform/tenants", {
    method: "PATCH",
    headers: {
      host: "dvadtech.in",
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function tenantRequest(url: string, host: string, init?: { method?: string; cookie?: string; body?: unknown }) {
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

async function createPair(label: string) {
  const email = `owner-${label.toLowerCase()}${suffix}@example.com`;
  const created = await signupTenantWithRestaurants({
    tenantName: `${label}${suffix}`,
    billingEmail: `billing-${label}${suffix}@example.com`,
    restaurants: [
      {
        name: `${label}${suffix}`,
        ownerEmail: email,
        ownerName: "Chandrasheker",
        ownerPassword: sharedPassword,
      },
    ],
  });
  return { created, email, host: `${created.tenant.slug}.dvadtech.in` };
}

describe("platform TenantAdmin password reset", () => {
  it("resets TenantAdmin password without changing restaurant OWNER credentials", async () => {
    const { created, email, host } = await createPair("ResetOk");
    const admin = created.tenantAdmin;

    const beforeLogin = await tenantAdminLogin(
      tenantRequest(`http://${host}/api/tenant-admin/auth/login`, host, {
        method: "POST",
        body: { email, password: sharedPassword },
      }),
      emptyRouteContext,
    );
    assert.equal(beforeLogin.status, 200);

    const updated = await resetTenantAdminPassword({
      tenantId: created.tenant.id,
      tenantAdminId: admin.id,
      newPassword: nextPassword,
      actorPlatformAdminId: "padmin-reset",
    });
    assert.equal(updated.email, email);
    assert.equal("passwordHash" in updated, false);

    const oldRejected = await tenantAdminLogin(
      tenantRequest(`http://${host}/api/tenant-admin/auth/login`, host, {
        method: "POST",
        body: { email, password: sharedPassword },
      }),
      emptyRouteContext,
    );
    assert.equal(oldRejected.status, 401);

    const newAccepted = await tenantAdminLogin(
      tenantRequest(`http://${host}/api/tenant-admin/auth/login`, host, {
        method: "POST",
        body: { email, password: nextPassword },
      }),
      emptyRouteContext,
    );
    assert.equal(newAccepted.status, 200);

    const ownerLogin = await staffLogin(
      tenantRequest(`http://${host}/api/auth/login`, host, {
        method: "POST",
        body: { email, password: sharedPassword },
      }),
      emptyRouteContext,
    );
    assert.equal(ownerLogin.status, 200);
  });

  it("rejects a TenantAdmin id that belongs to another tenant and does not mutate it", async () => {
    const a = await createPair("ResetA");
    const b = await createPair("ResetB");
    const beforeHash = (await prisma.tenantAdmin.findUnique({ where: { id: b.created.tenantAdmin.id } }))
      ?.passwordHash;
    await assert.rejects(
      () =>
        resetTenantAdminPassword({
          tenantId: a.created.tenant.id,
          tenantAdminId: b.created.tenantAdmin.id,
          newPassword: "attacker12",
          actorPlatformAdminId: "padmin-wrong-tenant",
        }),
      /not found/i,
    );
    const afterHash = (await prisma.tenantAdmin.findUnique({ where: { id: b.created.tenantAdmin.id } }))
      ?.passwordHash;
    assert.equal(afterHash, beforeHash);
  });

  it("rejects restaurant staff, TenantAdmin, and anonymous callers on the platform endpoint", async () => {
    const previous = process.env.NODE_ENV;
    const env = process.env as { NODE_ENV?: string };
    env.NODE_ENV = "production";
    const { created, email, host } = await createPair("ResetDeny");
    const tenantToken = await createTenantAdminToken({
      id: created.tenantAdmin.id,
      email,
      name: "Chandrasheker",
      tenantId: created.tenant.id,
      authVersion: 0,
    });
    const staff = await staffLogin(
      tenantRequest(`http://${host}/api/auth/login`, host, {
        method: "POST",
        body: { email, password: sharedPassword },
      }),
      emptyRouteContext,
    );
    const staffCookie = staff.headers.get("set-cookie") ?? "";
    const staffMatch = staffCookie.match(new RegExp(`${STAFF_SESSION_COOKIE}=([^;]+)`));

    const anonymous = await tenantsPatch(
      platformRequest({
        action: "reset_tenant_admin_password",
        tenantId: created.tenant.id,
        tenantAdminId: created.tenantAdmin.id,
        newPassword: "nope123",
      }),
      emptyRouteContext,
    );
    const asTenantAdmin = await tenantsPatch(
      platformRequest(
        {
          action: "reset_tenant_admin_password",
          tenantId: created.tenant.id,
          tenantAdminId: created.tenantAdmin.id,
          newPassword: "nope123",
        },
        `${TENANT_ADMIN_COOKIE}=${tenantToken}`,
      ),
      emptyRouteContext,
    );
    const asStaff = await tenantsPatch(
      platformRequest(
        {
          action: "reset_tenant_admin_password",
          tenantId: created.tenant.id,
          tenantAdminId: created.tenantAdmin.id,
          newPassword: "nope123",
        },
        staffMatch ? `${STAFF_SESSION_COOKIE}=${staffMatch[1]}` : "",
      ),
      emptyRouteContext,
    );
    assert.equal(anonymous.status, 401);
    assert.equal(asTenantAdmin.status, 401);
    assert.equal(asStaff.status, 401);
    env.NODE_ENV = previous;
  });

  it("invalidates the existing TenantAdmin token after reset", async () => {
    const { created, email, host } = await createPair("ResetSess");
    const before = await prisma.tenantAdmin.findUnique({ where: { id: created.tenantAdmin.id } });
    assert.ok(before);
    const oldToken = await createTenantAdminToken({
      id: before.id,
      email: before.email,
      name: before.name,
      tenantId: before.tenantId,
      authVersion: before.authVersion,
    });

    await resetTenantAdminPassword({
      tenantId: created.tenant.id,
      tenantAdminId: created.tenantAdmin.id,
      newPassword: nextPassword,
      actorPlatformAdminId: "padmin-session",
    });

    const after = await prisma.tenantAdmin.findUnique({ where: { id: created.tenantAdmin.id } });
    assert.ok(after);
    const payload = await verifyTenantAdminToken(oldToken);
    assert.ok(payload);
    assert.equal(payload.authVersion ?? 0, before.authVersion);
    assert.notEqual(after.authVersion, before.authVersion);
    assert.notEqual(payload.authVersion ?? 0, after.authVersion);

    const relogin = await tenantAdminLogin(
      tenantRequest(`http://${host}/api/tenant-admin/auth/login`, host, {
        method: "POST",
        body: { email, password: nextPassword },
      }),
      emptyRouteContext,
    );
    assert.equal(relogin.status, 200);
  });

  it("writes one TENANT_ADMIN_PASSWORD_RESET event without password material", async () => {
    const { created, email } = await createPair("ResetAudit");
    await resetTenantAdminPassword({
      tenantId: created.tenant.id,
      tenantAdminId: created.tenantAdmin.id,
      newPassword: nextPassword,
      actorPlatformAdminId: "padmin-audit",
    });
    const events = await prisma.platformAuditEvent.findMany({
      where: {
        action: "TENANT_ADMIN_PASSWORD_RESET",
        tenantId: created.tenant.id,
      },
    });
    assert.equal(events.length, 1);
    const blob = JSON.stringify(events[0]);
    assert.equal(blob.includes(nextPassword), false);
    assert.equal(blob.includes("passwordHash"), false);
    assert.equal(blob.includes(email), true);
    assert.equal(events[0].resourceId, created.tenantAdmin.id);
  });
});

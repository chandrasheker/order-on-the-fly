import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { NextRequest } from "next/server";
import type { PrismaClient } from "@/generated/prisma/client";
import { SERVICE_TABLE_NUMBER_FLOOR } from "@/lib/order-channel";

const dbPath = path.join(os.tmpdir(), `tabletap-admission-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_URL = `file:${dbPath}`;
process.env.JWT_SECRET = process.env.JWT_SECRET || "admission-jwt-secret-must-be-32-chars";
process.env.TENANT_BASE_DOMAIN = "dvadtech.in";

let prisma: PrismaClient;
let signupTenantWithRestaurants: typeof import("@/lib/tenant-onboarding-service").signupTenantWithRestaurants;
let openTableOrdering: typeof import("@/lib/table-ordering-service").openTableOrdering;
let releaseTableVisit: typeof import("@/lib/table-ordering-service").releaseTableVisit;
let maybeAutoCloseTableAfterPayment: typeof import("@/lib/table-ordering-service").maybeAutoCloseTableAfterPayment;
let currentTableAccessCode: typeof import("@/lib/table-access-code").currentTableAccessCode;
let ensureServiceTables: typeof import("@/lib/service-tables").ensureServiceTables;
let checkInPost: typeof import("@/app/api/tables/check-in/route").POST;

const suffix = `${Date.now()}`;
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
  ({ openTableOrdering, releaseTableVisit, maybeAutoCloseTableAfterPayment } = await import(
    "@/lib/table-ordering-service"
  ));
  ({ currentTableAccessCode } = await import("@/lib/table-access-code"));
  ({ ensureServiceTables } = await import("@/lib/service-tables"));
  ({ POST: checkInPost } = await import("@/app/api/tables/check-in/route"));
});

after(async () => {
  if (prisma) await prisma.$disconnect().catch(() => undefined);
  for (const extra of ["", "-wal", "-shm", "-journal"]) {
    fs.rmSync(`${dbPath}${extra}`, { force: true });
  }
});

async function createRestaurant(label: string, tableCount = 2) {
  const created = await signupTenantWithRestaurants({
    tenantName: `${label}${suffix}`,
    billingEmail: `billing-${label.toLowerCase()}${suffix}@example.com`,
    restaurants: [
      {
        name: `${label}${suffix}`,
        ownerEmail: `owner-${label.toLowerCase()}${suffix}@example.com`,
        ownerName: "Owner",
        ownerPassword: "password12",
        tableCount,
      },
    ],
  });
  const restaurant = created.restaurants[0].restaurant;
  const host = `${restaurant.slug}.dvadtech.in`;
  return { created, restaurant, host };
}

function checkInRequest(host: string, body: Record<string, unknown>) {
  return new NextRequest(`http://${host}/api/tables/check-in`, {
    method: "POST",
    headers: { host, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function postCheckIn(table: { qrToken: string; id: string }, host: string, sessionKey: string) {
  const accessCode = currentTableAccessCode(table);
  return checkInPost(
    checkInRequest(host, {
      tableToken: table.qrToken,
      sessionKey,
      accessCode,
    }),
    emptyRouteContext,
  );
}

describe("dine-in QR admission lifecycle", () => {
  it("creates real tables closed and blocks saved QR check-in until staff open", async () => {
    const { restaurant, host } = await createRestaurant("ClosedGate");
    const table = await prisma.table.findFirst({
      where: { restaurantId: restaurant.id, number: 1 },
    });
    assert.ok(table);
    assert.equal(table.orderingEnabled, false);
    assert.equal(table.qrToken, `${restaurant.slug}-table-1`);

    const closed = await postCheckIn(table, host, `sess-closed-${suffix}`);
    assert.equal(closed.status, 403);
    const closedJson = await closed.json();
    assert.equal(closedJson.code, "TABLE_ORDERING_CLOSED");
    assert.equal(await prisma.tableSession.count({ where: { tableId: table.id } }), 0);

    await openTableOrdering(table.id);
    const opened = await prisma.table.findUnique({ where: { id: table.id } });
    assert.equal(opened?.orderingEnabled, true);

    const ok = await postCheckIn(table, host, `sess-open-${suffix}`);
    assert.equal(ok.status, 200);
    const okJson = await ok.json();
    assert.equal(okJson.success, true);
    assert.equal(await prisma.tableSession.count({ where: { tableId: table.id } }), 1);
  });

  it("closes admission after visit release so a saved QR cannot start another visit", async () => {
    const { restaurant, host } = await createRestaurant("VisitEnd");
    const table = await prisma.table.findFirst({
      where: { restaurantId: restaurant.id, number: 1 },
    });
    assert.ok(table);
    await openTableOrdering(table.id);
    const first = await postCheckIn(table, host, `sess-first-${suffix}`);
    assert.equal(first.status, 200);

    await releaseTableVisit(table.id);
    const after = await prisma.table.findUnique({ where: { id: table.id } });
    assert.equal(after?.orderingEnabled, false);
    assert.equal(after?.orderingOpenedAt, null);
    assert.equal(await prisma.tableSession.count({ where: { tableId: table.id } }), 0);

    const again = await postCheckIn(table, host, `sess-again-${suffix}`);
    assert.equal(again.status, 403);
    assert.equal((await again.json()).code, "TABLE_ORDERING_CLOSED");
    assert.equal(await prisma.tableSession.count({ where: { tableId: table.id } }), 0);
  });

  it("auto-closes TABLE_SERVICE after settlement", async () => {
    const { restaurant } = await createRestaurant("AutoClose");
    const table = await prisma.table.findFirst({
      where: { restaurantId: restaurant.id, number: 1 },
    });
    assert.ok(table);
    await prisma.table.update({
      where: { id: table.id },
      data: { orderingEnabled: true, seatedAt: new Date() },
    });
    await maybeAutoCloseTableAfterPayment(table.id);
    const after = await prisma.table.findUnique({ where: { id: table.id } });
    assert.equal(after?.orderingEnabled, false);
    assert.equal(after?.orderingOpenedAt, null);
  });

  it("applies the corrective migration to previously enabled real tables only", async () => {
    const { restaurant } = await createRestaurant("MigrateClose", 1);
    await ensureServiceTables(restaurant.id, restaurant.slug);
    const dineIn = await prisma.table.findFirst({
      where: { restaurantId: restaurant.id, number: 1 },
    });
    assert.ok(dineIn);
    await prisma.table.update({
      where: { id: dineIn.id },
      data: { orderingEnabled: true },
    });
    const service = await prisma.table.findFirst({
      where: { restaurantId: restaurant.id, number: { gte: SERVICE_TABLE_NUMBER_FLOOR } },
    });
    assert.ok(service);
    assert.equal(service.orderingEnabled, true);

    const sql = fs.readFileSync(
      path.join(process.cwd(), "prisma/migrations/20260910140000_restore_dine_in_admission_closed/migration.sql"),
      "utf8",
    );
    assert.match(sql, /UPDATE "Table" SET "orderingEnabled" = 0 WHERE "number" < 900/);
    await prisma.$executeRawUnsafe(`UPDATE "Table" SET "orderingEnabled" = 0 WHERE "number" < 900`);

    const dineInAfter = await prisma.table.findUnique({ where: { id: dineIn.id } });
    const serviceAfter = await prisma.table.findUnique({ where: { id: service.id } });
    assert.equal(dineInAfter?.orderingEnabled, false);
    assert.equal(serviceAfter?.orderingEnabled, true);
    assert.equal(await prisma.order.count({ where: { restaurantId: restaurant.id } }), 0);
  });

  it("keeps new restaurant and QR table creation paths closed by default", async () => {
    const { restaurant } = await createRestaurant("NewClosed", 3);
    const tables = await prisma.table.findMany({
      where: { restaurantId: restaurant.id, number: { lt: SERVICE_TABLE_NUMBER_FLOOR } },
    });
    assert.equal(tables.length, 3);
    assert.ok(tables.every((table) => table.orderingEnabled === false));

    const created = await prisma.table.create({
      data: {
        number: 8,
        qrToken: `${restaurant.slug}-table-8`,
        kind: "DINE_IN",
        restaurantId: restaurant.id,
      },
    });
    assert.equal(created.orderingEnabled, false);
  });

  it("documents postgres default and backfill without rewriting history", async () => {
    const schema = fs.readFileSync(path.join(process.cwd(), "prisma/schema.postgres.prisma"), "utf8");
    assert.match(schema, /orderingEnabled Boolean\s+@default\(false\)/);
    const sql = fs.readFileSync(
      path.join(process.cwd(), "prisma/migrations-postgres/000025_restore_dine_in_admission_closed/migration.sql"),
      "utf8",
    );
    assert.match(sql, /SET DEFAULT false/);
    assert.match(sql, /number" < 900/);
    const historical = fs.readFileSync(
      path.join(process.cwd(), "prisma/migrations-postgres/000023_dine_in_tables_default_enabled/migration.sql"),
      "utf8",
    );
    assert.match(historical, /SET DEFAULT true/);
  });
});

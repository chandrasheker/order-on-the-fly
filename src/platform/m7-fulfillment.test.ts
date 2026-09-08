import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { PAYMENT_STATUS } from "@/lib/order-financials";
import { snapshotFulfillmentMode } from "@/lib/fulfillment/resolve";
import { canPerformOrderAction } from "@/lib/staff-permissions";

const dbPath = path.join(os.tmpdir(), `tabletap-m7-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_URL = `file:${dbPath}`;
process.env.JWT_SECRET = process.env.JWT_SECRET || "m7-test-jwt-secret-must-be-32-chars!!";
process.env.TENANT_BASE_DOMAIN = "dvadtech.in";
process.env.JOB_QUEUE_INLINE = "0";

let prisma: PrismaClient;
let createOrderForTable: typeof import("@/lib/order-service").createOrderForTable;
let markSelfPickupCollected: typeof import("@/lib/fulfillment/collection").markSelfPickupCollected;
let evaluateCollectionEligibility: typeof import("@/lib/fulfillment/collection").evaluateCollectionEligibility;
let SelfPickupCollectionError: typeof import("@/lib/fulfillment/collection").SelfPickupCollectionError;
let loadOrderForCollection: typeof import("@/lib/fulfillment/collection").loadOrderForCollection;
let customerPickupState: typeof import("@/lib/fulfillment/collection").customerPickupState;
let evaluateSelfPickupNotifications: typeof import("@/lib/fulfillment/notify").evaluateSelfPickupNotifications;
let recordOrderPayment: typeof import("@/lib/payment-allocation-service").recordOrderPayment;
let getPickupQueue: typeof import("@/lib/fulfillment/pickup-queue").getPickupQueue;
let getCommandCenter: typeof import("@/platform/command-center/metrics-service").getCommandCenter;
let resolveTimeRange: typeof import("@/platform/command-center/time-range").resolveTimeRange;
let maybeAutoCloseTableAfterPayment: typeof import("@/lib/table-ordering-service").maybeAutoCloseTableAfterPayment;
let hashPassword: typeof import("@/lib/auth").hashPassword;
let finalizeOrderBill: typeof import("@/lib/bill-service").finalizeOrderBill;

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
  ({ createOrderForTable } = await import("@/lib/order-service"));
  ({
    markSelfPickupCollected,
    evaluateCollectionEligibility,
    SelfPickupCollectionError,
    loadOrderForCollection,
    customerPickupState,
  } = await import("@/lib/fulfillment/collection"));
  ({ evaluateSelfPickupNotifications } = await import("@/lib/fulfillment/notify"));
  ({ recordOrderPayment } = await import("@/lib/payment-allocation-service"));
  ({ getPickupQueue } = await import("@/lib/fulfillment/pickup-queue"));
  ({ getCommandCenter } = await import("@/platform/command-center/metrics-service"));
  ({ resolveTimeRange } = await import("@/platform/command-center/time-range"));
  ({ maybeAutoCloseTableAfterPayment } = await import("@/lib/table-ordering-service"));
  ({ hashPassword } = await import("@/lib/auth"));
  ({ finalizeOrderBill } = await import("@/lib/bill-service"));
});

after(async () => {
  if (prisma) await prisma.$disconnect().catch(() => undefined);
  for (const extra of ["", "-wal", "-shm", "-journal"]) {
    fs.rmSync(`${dbPath}${extra}`, { force: true });
  }
});

async function seedRestaurant(
  suffix: string,
  extras?: { serviceMode?: string; hybridDefault?: string; pickupLabel?: string },
) {
  const restaurant = await prisma.restaurant.create({
    data: {
      name: `R ${suffix}`,
      nameNormalized: `r ${suffix}`,
      slug: `r-${suffix}`,
      serviceMode: extras?.serviceMode ?? "FULL_SERVICE",
      hybridDefaultFulfillment: extras?.hybridDefault ?? "TABLE_SERVICE",
      pickupLocationLabel: extras?.pickupLabel ?? "Pickup Counter",
    },
  });
  const table = await prisma.table.create({
    data: {
      number: 12,
      restaurantId: restaurant.id,
      qrToken: `qr-${suffix}`,
      orderingEnabled: true,
    },
  });
  const category = await prisma.menuCategory.create({
    data: { name: "Mains", slug: `mains-${suffix}`, restaurantId: restaurant.id },
  });
  const burger = await prisma.menuItem.create({
    data: { name: "Burger", price: 280, categoryId: category.id, prepTimeMinutes: 5 },
  });
  const pizza = await prisma.menuItem.create({
    data: { name: "Pizza", price: 720, categoryId: category.id, prepTimeMinutes: 8 },
  });
  return { restaurant, table, burger, pizza };
}

async function createStaff(
  restaurant: { id: string; name: string; slug: string },
  role: "OWNER" | "MANAGER" | "SERVER" | "COOK",
  suffix: string,
) {
  return prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${suffix}@test.local`,
      name: role,
      role,
      restaurantId: restaurant.id,
      passwordHash: await hashPassword("password12"),
    },
  });
}

async function markItemsReady(orderId: string) {
  await prisma.orderItem.updateMany({
    where: { orderId, status: { not: "UNAVAILABLE" } },
    data: { status: "READY" },
  });
  const { syncOrderStatus } = await import("@/lib/order-service");
  await syncOrderStatus(orderId);
}

describe("M7 dual/hybrid fulfillment", () => {
  it("defaults existing restaurants to FULL_SERVICE and orders to TABLE_SERVICE", async () => {
    const suffix = `def-${Date.now()}`;
    const restaurant = await prisma.restaurant.create({
      data: { name: `Def ${suffix}`, nameNormalized: `def ${suffix}`, slug: `def-${suffix}` },
    });
    assert.equal(restaurant.serviceMode, "FULL_SERVICE");
    const table = await prisma.table.create({
      data: { number: 1, restaurantId: restaurant.id, qrToken: `def-${suffix}` },
    });
    const category = await prisma.menuCategory.create({
      data: { name: "M", slug: `m-${suffix}`, restaurantId: restaurant.id },
    });
    const item = await prisma.menuItem.create({
      data: { name: "Tea", price: 40, categoryId: category.id },
    });
    const created = await createOrderForTable({
      tableId: table.id,
      restaurantId: restaurant.id,
      items: [{ menuItemId: item.id, quantity: 1 }],
      placedByUserId: "staff",
      placedByName: "Staff",
    });
    assert.equal(created.order.fulfillmentMode, "TABLE_SERVICE");
    assert.equal(snapshotFulfillmentMode({ serviceMode: restaurant.serviceMode }), "TABLE_SERVICE");
  });

  it("FULL_SERVICE forces TABLE_SERVICE and SELF_SERVICE forces SELF_PICKUP", async () => {
    const full = seedRestaurant(`full-${Date.now()}`);
    const self = seedRestaurant(`self-${Date.now()}`, { serviceMode: "SELF_SERVICE", pickupLabel: "Main Counter" });
    const [{ restaurant: fr, table: ft, burger: fb }, { restaurant: sr, table: st, burger: sb }] =
      await Promise.all([full, self]);
    const forcedTable = await createOrderForTable({
      tableId: ft.id,
      restaurantId: fr.id,
      items: [{ menuItemId: fb.id, quantity: 1 }],
      requestedFulfillmentMode: "SELF_PICKUP",
      placedByUserId: "s",
      placedByName: "S",
    });
    assert.equal(forcedTable.order.fulfillmentMode, "TABLE_SERVICE");
    const forcedPickup = await createOrderForTable({
      tableId: st.id,
      restaurantId: sr.id,
      items: [{ menuItemId: sb.id, quantity: 1 }],
      requestedFulfillmentMode: "TABLE_SERVICE",
      placedByUserId: "s",
      placedByName: "S",
    });
    assert.equal(forcedPickup.order.fulfillmentMode, "SELF_PICKUP");
    assert.ok(forcedPickup.order.pickupCode);
  });

  it("HYBRID allows both and uses configured default when omitted", async () => {
    const { restaurant, table, burger } = await seedRestaurant(`hy-${Date.now()}`, {
      serviceMode: "HYBRID",
      hybridDefault: "TABLE_SERVICE",
    });
    const def = await createOrderForTable({
      tableId: table.id,
      restaurantId: restaurant.id,
      items: [{ menuItemId: burger.id, quantity: 1 }],
      placedByUserId: "s",
      placedByName: "S",
    });
    assert.equal(def.order.fulfillmentMode, "TABLE_SERVICE");
    const pickup = await createOrderForTable({
      tableId: table.id,
      restaurantId: restaurant.id,
      items: [{ menuItemId: burger.id, quantity: 1 }],
      requestedFulfillmentMode: "SELF_PICKUP",
      placedByUserId: "s",
      placedByName: "S",
    });
    assert.equal(pickup.order.fulfillmentMode, "SELF_PICKUP");
  });

  it("order fulfillment snapshot does not change when restaurant mode changes later", async () => {
    const { restaurant, table, burger } = await seedRestaurant(`snap-${Date.now()}`);
    const created = await createOrderForTable({
      tableId: table.id,
      restaurantId: restaurant.id,
      items: [{ menuItemId: burger.id, quantity: 1 }],
      placedByUserId: "s",
      placedByName: "S",
    });
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { serviceMode: "SELF_SERVICE" },
    });
    const again = await prisma.order.findUnique({ where: { id: created.order.id } });
    assert.equal(again?.fulfillmentMode, "TABLE_SERVICE");
  });

  it("blocks unpaid SELF_PICKUP collection for every role and leaves state unchanged", async () => {
    const suffix = `unpaid-${Date.now()}`;
    const { restaurant, table, burger } = await seedRestaurant(suffix, { serviceMode: "SELF_SERVICE" });
    const owner = await createStaff(restaurant, "OWNER", suffix);
    const manager = await createStaff(restaurant, "MANAGER", suffix);
    const server = await createStaff(restaurant, "SERVER", suffix);
    const cook = await createStaff(restaurant, "COOK", suffix);
    const created = await createOrderForTable({
      tableId: table.id,
      restaurantId: restaurant.id,
      items: [{ menuItemId: burger.id, quantity: 1 }],
      placedByUserId: owner.id,
      placedByName: owner.name,
    });
    await markItemsReady(created.order.id);
    const before = await prisma.order.findUnique({
      where: { id: created.order.id },
      include: { items: true },
    });
    for (const actor of [owner, manager, server, cook]) {
      await assert.rejects(
        () =>
          markSelfPickupCollected({
            restaurantId: restaurant.id,
            orderId: created.order.id,
            actor: { id: actor.id, role: actor.role, name: actor.name },
          }),
        (err: unknown) => {
          assert.ok(err instanceof SelfPickupCollectionError);
          assert.equal(err.code, "PAYMENT_REQUIRED");
          assert.equal(err.status, 409);
          assert.ok((err.outstandingAmountPaise ?? 0) > 0);
          return true;
        },
      );
    }
    const after = await prisma.order.findUnique({
      where: { id: created.order.id },
      include: { items: true },
    });
    assert.equal(after?.collectedAt, null);
    assert.notEqual(after?.status, "SERVED");
    assert.deepEqual(
      after?.items.map((item) => item.status),
      before?.items.map((item) => item.status),
    );
    const denied = await prisma.platformAuditEvent.findMany({
      where: { action: "SELF_SERVICE_COLLECTION_DENIED", resourceId: created.order.id },
    });
    assert.ok(denied.length >= 1);
    const meta = JSON.parse(denied[0]!.metadataJson ?? "{}") as Record<string, unknown>;
    assert.equal(meta.orderId, created.order.id);
    assert.equal(meta.fulfillmentMode, "SELF_PICKUP");
    assert.equal(typeof meta.outstandingAmountPaise, "number");
    assert.equal(meta.secret, undefined);
    assert.ok(canPerformOrderAction("COOK", "collect-order"));
    assert.equal(canPerformOrderAction("COOK", "mark-paid"), false);
  });

  it("partial, pending, and failed payments still block collection", async () => {
    const suffix = `part-${Date.now()}`;
    const { restaurant, table, burger, pizza } = await seedRestaurant(suffix, { serviceMode: "SELF_SERVICE" });
    const owner = await createStaff(restaurant, "OWNER", suffix);
    const created = await createOrderForTable({
      tableId: table.id,
      restaurantId: restaurant.id,
      items: [
        { menuItemId: burger.id, quantity: 1 },
        { menuItemId: pizza.id, quantity: 1 },
      ],
      placedByUserId: owner.id,
      placedByName: owner.name,
    });
    await markItemsReady(created.order.id);
    const paid = await recordOrderPayment({
      orderId: created.order.id,
      amount: 700,
      method: "CASH",
      collectedByUserId: owner.id,
      collectedByName: owner.name,
    });
    assert.equal(paid.ok, true);
    await assert.rejects(
      () =>
        markSelfPickupCollected({
          restaurantId: restaurant.id,
          orderId: created.order.id,
          actor: { id: owner.id, role: "OWNER", name: owner.name },
        }),
      (err: unknown) => err instanceof SelfPickupCollectionError && err.code === "PAYMENT_REQUIRED",
    );

    const pendingOrder = await createOrderForTable({
      tableId: table.id,
      restaurantId: restaurant.id,
      items: [{ menuItemId: burger.id, quantity: 1 }],
      placedByUserId: owner.id,
      placedByName: owner.name,
    });
    await markItemsReady(pendingOrder.order.id);
    await prisma.payment.create({
      data: {
        restaurantId: restaurant.id,
        tableId: table.id,
        orderId: pendingOrder.order.id,
        amount: 280,
        method: "UPI",
        status: PAYMENT_STATUS.PENDING,
        provider: "razorpay",
      },
    });
    const pendingElig = evaluateCollectionEligibility(
      (await loadOrderForCollection(prisma, restaurant.id, pendingOrder.order.id))!,
    );
    assert.equal(pendingElig.collectable, false);
    assert.equal(pendingElig.denyReason, "PAYMENT_REQUIRED");

    const failedOrder = await createOrderForTable({
      tableId: table.id,
      restaurantId: restaurant.id,
      items: [{ menuItemId: burger.id, quantity: 1 }],
      placedByUserId: owner.id,
      placedByName: owner.name,
    });
    await markItemsReady(failedOrder.order.id);
    await prisma.payment.create({
      data: {
        restaurantId: restaurant.id,
        tableId: table.id,
        orderId: failedOrder.order.id,
        amount: 280,
        method: "UPI",
        status: PAYMENT_STATUS.FAILED,
        provider: "razorpay",
      },
    });
    const failedElig = evaluateCollectionEligibility(
      (await loadOrderForCollection(prisma, restaurant.id, failedOrder.order.id))!,
    );
    assert.equal(failedElig.collectable, false);
  });

  it("settled payment unlocks collection without re-marking READY and collect is idempotent", async () => {
    const suffix = `pay-${Date.now()}`;
    const { restaurant, table, burger } = await seedRestaurant(suffix, { serviceMode: "SELF_SERVICE" });
    const owner = await createStaff(restaurant, "OWNER", suffix);
    const created = await createOrderForTable({
      tableId: table.id,
      restaurantId: restaurant.id,
      items: [{ menuItemId: burger.id, quantity: 1 }],
      placedByUserId: owner.id,
      placedByName: owner.name,
    });
    await markItemsReady(created.order.id);
    const readyBeforePay = await prisma.order.findUnique({ where: { id: created.order.id } });
    assert.ok(readyBeforePay?.readyAt);
    assert.equal(customerPickupState((await loadOrderForCollection(prisma, restaurant.id, created.order.id))!), "FOOD_READY_PAYMENT_REQUIRED");

    const pay = await recordOrderPayment({
      orderId: created.order.id,
      amount: 280,
      method: "CASH",
      collectedByUserId: owner.id,
      collectedByName: owner.name,
    });
    assert.equal(pay.ok, true);
    const afterPay = await loadOrderForCollection(prisma, restaurant.id, created.order.id);
    assert.equal(customerPickupState(afterPay!), "READY_FOR_COLLECTION");
    assert.equal(evaluateCollectionEligibility(afterPay!).collectable, true);
    const readyAfterPay = await prisma.order.findUnique({ where: { id: created.order.id } });
    assert.equal(readyAfterPay?.readyAt?.toISOString(), readyBeforePay?.readyAt?.toISOString());

    const first = await markSelfPickupCollected({
      restaurantId: restaurant.id,
      orderId: created.order.id,
      actor: { id: owner.id, role: "OWNER", name: owner.name },
    });
    assert.ok(first.collectedAt);
    const collectedAt = first.collectedAt!.toISOString();
    const second = await markSelfPickupCollected({
      restaurantId: restaurant.id,
      orderId: created.order.id,
      actor: { id: owner.id, role: "OWNER", name: owner.name },
    });
    assert.equal(second.collectedAt?.toISOString(), collectedAt);
    const collectedEvents = await prisma.platformAuditEvent.count({
      where: { action: "ORDER_COLLECTED", resourceId: created.order.id },
    });
    assert.equal(collectedEvents, 1);

    await prisma.table.update({
      where: { id: table.id },
      data: { orderingEnabled: true },
    });
    await maybeAutoCloseTableAfterPayment(table.id);
    const tableAfter = await prisma.table.findUnique({ where: { id: table.id } });
    assert.equal(tableAfter?.orderingEnabled, true);
  });

  it("requires all items ready and rejects cancelled orders", async () => {
    const suffix = `ready-${Date.now()}`;
    const { restaurant, table, burger, pizza } = await seedRestaurant(suffix, { serviceMode: "SELF_SERVICE" });
    const owner = await createStaff(restaurant, "OWNER", suffix);
    const created = await createOrderForTable({
      tableId: table.id,
      restaurantId: restaurant.id,
      items: [
        { menuItemId: burger.id, quantity: 1 },
        { menuItemId: pizza.id, quantity: 1 },
      ],
      placedByUserId: owner.id,
      placedByName: owner.name,
    });
    const items = await prisma.orderItem.findMany({ where: { orderId: created.order.id } });
    await prisma.orderItem.update({ where: { id: items[0]!.id }, data: { status: "READY" } });
    await recordOrderPayment({
      orderId: created.order.id,
      amount: 1000,
      method: "CASH",
      collectedByUserId: owner.id,
      collectedByName: owner.name,
    });
    await assert.rejects(
      () =>
        markSelfPickupCollected({
          restaurantId: restaurant.id,
          orderId: created.order.id,
          actor: { id: owner.id, role: "OWNER", name: owner.name },
        }),
      (err: unknown) => err instanceof SelfPickupCollectionError && err.code === "NOT_READY",
    );

    const cancelled = await createOrderForTable({
      tableId: table.id,
      restaurantId: restaurant.id,
      items: [{ menuItemId: burger.id, quantity: 1 }],
      placedByUserId: owner.id,
      placedByName: owner.name,
    });
    await markItemsReady(cancelled.order.id);
    await recordOrderPayment({
      orderId: cancelled.order.id,
      amount: 280,
      method: "CASH",
      collectedByUserId: owner.id,
      collectedByName: owner.name,
    });
    await prisma.order.update({ where: { id: cancelled.order.id }, data: { status: "CANCELLED" } });
    await assert.rejects(
      () =>
        markSelfPickupCollected({
          restaurantId: restaurant.id,
          orderId: cancelled.order.id,
          actor: { id: owner.id, role: "OWNER", name: owner.name },
        }),
      (err: unknown) => err instanceof SelfPickupCollectionError && err.code === "CANCELLED",
    );
  });

  it("HYBRID TABLE_SERVICE does not inherit the pickup payment gate", async () => {
    const suffix = `mix-${Date.now()}`;
    const { restaurant, table, burger } = await seedRestaurant(suffix, { serviceMode: "HYBRID" });
    const owner = await createStaff(restaurant, "OWNER", suffix);
    const tableOrder = await createOrderForTable({
      tableId: table.id,
      restaurantId: restaurant.id,
      items: [{ menuItemId: burger.id, quantity: 1 }],
      requestedFulfillmentMode: "TABLE_SERVICE",
      placedByUserId: owner.id,
      placedByName: owner.name,
    });
    const pickupOrder = await createOrderForTable({
      tableId: table.id,
      restaurantId: restaurant.id,
      items: [{ menuItemId: burger.id, quantity: 1 }],
      requestedFulfillmentMode: "SELF_PICKUP",
      placedByUserId: owner.id,
      placedByName: owner.name,
    });
    await markItemsReady(tableOrder.order.id);
    await markItemsReady(pickupOrder.order.id);
    assert.equal(
      evaluateCollectionEligibility((await loadOrderForCollection(prisma, restaurant.id, tableOrder.order.id))!)
        .denyReason,
      "NOT_SELF_PICKUP",
    );
    await assert.rejects(
      () =>
        markSelfPickupCollected({
          restaurantId: restaurant.id,
          orderId: pickupOrder.order.id,
          actor: { id: owner.id, role: "OWNER", name: owner.name },
        }),
      (err: unknown) => err instanceof SelfPickupCollectionError && err.code === "PAYMENT_REQUIRED",
    );
  });

  it("restaurant A cannot collect restaurant B and notifications fire once", async () => {
    const a = await seedRestaurant(`a-${Date.now()}`, { serviceMode: "SELF_SERVICE" });
    const b = await seedRestaurant(`b-${Date.now()}`, { serviceMode: "SELF_SERVICE" });
    const ownerA = await createStaff(a.restaurant, "OWNER", `a-${Date.now()}`);
    const ownerB = await createStaff(b.restaurant, "OWNER", `b-${Date.now()}`);
    const orderA = await createOrderForTable({
      tableId: a.table.id,
      restaurantId: a.restaurant.id,
      items: [{ menuItemId: a.burger.id, quantity: 1 }],
      placedByUserId: ownerA.id,
      placedByName: ownerA.name,
    });
    await markItemsReady(orderA.order.id);
    await recordOrderPayment({
      orderId: orderA.order.id,
      amount: 280,
      method: "CASH",
      collectedByUserId: ownerA.id,
      collectedByName: ownerA.name,
    });
    const foreign = await loadOrderForCollection(prisma, b.restaurant.id, orderA.order.id);
    assert.equal(foreign, null);
    await assert.rejects(
      () =>
        markSelfPickupCollected({
          restaurantId: b.restaurant.id,
          orderId: orderA.order.id,
          actor: { id: ownerB.id, role: "OWNER", name: ownerB.name },
        }),
      (err: unknown) => err instanceof SelfPickupCollectionError && err.code === "NOT_FOUND",
    );

    const paidAgain = await evaluateSelfPickupNotifications(orderA.order.id);
    assert.equal(paidAgain.emitted, null);
    const paidOrder = await prisma.order.findUnique({ where: { id: orderA.order.id } });
    assert.ok(paidOrder?.readyForCollectionNotifiedAt);

    const unpaid = await createOrderForTable({
      tableId: a.table.id,
      restaurantId: a.restaurant.id,
      items: [{ menuItemId: a.burger.id, quantity: 1 }],
      placedByUserId: ownerA.id,
      placedByName: ownerA.name,
    });
    await markItemsReady(unpaid.order.id);
    const afterReady = await prisma.order.findUnique({ where: { id: unpaid.order.id } });
    assert.ok(afterReady?.readyPaymentRequiredNotifiedAt);
    assert.equal(afterReady?.readyForCollectionNotifiedAt, null);
    const requiredAgain = await evaluateSelfPickupNotifications(unpaid.order.id);
    assert.equal(requiredAgain.emitted, null);
    await recordOrderPayment({
      orderId: unpaid.order.id,
      amount: 280,
      method: "CASH",
      collectedByUserId: ownerA.id,
      collectedByName: ownerA.name,
    });
    const afterPay = await prisma.order.findUnique({ where: { id: unpaid.order.id } });
    assert.ok(afterPay?.readyForCollectionNotifiedAt);
    const unlockedAgain = await evaluateSelfPickupNotifications(unpaid.order.id);
    assert.equal(unlockedAgain.emitted, null);
  });

  it("zero-SERVER SELF_SERVICE restaurant can collect after payment", async () => {
    const suffix = `zero-${Date.now()}`;
    const { restaurant, table, burger } = await seedRestaurant(suffix, {
      serviceMode: "SELF_SERVICE",
      pickupLabel: "Main Counter",
    });
    const owner = await createStaff(restaurant, "OWNER", suffix);
    const cook = await createStaff(restaurant, "COOK", suffix);
    const servers = await prisma.user.count({ where: { restaurantId: restaurant.id, role: "SERVER" } });
    assert.equal(servers, 0);
    const created = await createOrderForTable({
      tableId: table.id,
      restaurantId: restaurant.id,
      items: [{ menuItemId: burger.id, quantity: 1 }],
      placedByUserId: owner.id,
      placedByName: owner.name,
    });
    assert.equal(created.order.fulfillmentMode, "SELF_PICKUP");
    await markItemsReady(created.order.id);
    await recordOrderPayment({
      orderId: created.order.id,
      amount: 280,
      method: "CASH",
      collectedByUserId: owner.id,
      collectedByName: owner.name,
    });
    const collected = await markSelfPickupCollected({
      restaurantId: restaurant.id,
      orderId: created.order.id,
      actor: { id: cook.id, role: "COOK", name: cook.name },
    });
    assert.ok(collected.collectedAt);
    const queue = await getPickupQueue(restaurant.id);
    assert.equal(queue.readyToHandover.length, 0);
    assert.ok(queue.recentlyCollected.some((row) => row.id === created.order.id));
  });

  it("pickup queue distinguishes paid vs unpaid and M5 uses business records", async () => {
    const suffix = `q-${Date.now()}`;
    const { restaurant, table, burger } = await seedRestaurant(suffix, { serviceMode: "SELF_SERVICE" });
    const owner = await createStaff(restaurant, "OWNER", suffix);
    const unpaid = await createOrderForTable({
      tableId: table.id,
      restaurantId: restaurant.id,
      items: [{ menuItemId: burger.id, quantity: 1 }],
      placedByUserId: owner.id,
      placedByName: owner.name,
    });
    const paid = await createOrderForTable({
      tableId: table.id,
      restaurantId: restaurant.id,
      items: [{ menuItemId: burger.id, quantity: 1 }],
      placedByUserId: owner.id,
      placedByName: owner.name,
    });
    await markItemsReady(unpaid.order.id);
    await markItemsReady(paid.order.id);
    await recordOrderPayment({
      orderId: paid.order.id,
      amount: 280,
      method: "CASH",
      collectedByUserId: owner.id,
      collectedByName: owner.name,
    });
    const queue = await getPickupQueue(restaurant.id);
    assert.ok(queue.paymentRequired.some((row) => row.id === unpaid.order.id && !row.paid));
    assert.ok(queue.readyToHandover.some((row) => row.id === paid.order.id && row.paid));

    const command = await getCommandCenter({ range: resolveTimeRange({ preset: "today" }) });
    const row = command.restaurants.find((item) => item.restaurantId === restaurant.id);
    assert.ok(row);
    assert.ok(row!.fulfillment.selfPickupOrders >= 2);
    assert.ok(row!.fulfillment.readyUnpaidOrders >= 1);
    assert.ok(row!.fulfillment.readyUnpaidOutstandingPaise > 0);
  });

  it("SELF_PICKUP READY items finalize an immutable Bill at the billable total, not ₹0", async () => {
    const suffix = `bill-${Date.now()}`;
    const { restaurant, table, burger } = await seedRestaurant(suffix, { serviceMode: "SELF_SERVICE" });
    const owner = await createStaff(restaurant, "OWNER", suffix);
    const created = await createOrderForTable({
      tableId: table.id,
      restaurantId: restaurant.id,
      items: [{ menuItemId: burger.id, quantity: 1 }],
      placedByUserId: owner.id,
      placedByName: owner.name,
    });
    await markItemsReady(created.order.id);
    const itemsBefore = await prisma.orderItem.findMany({ where: { orderId: created.order.id } });
    assert.ok(itemsBefore.every((item) => item.status === "READY"));
    const pay = await recordOrderPayment({
      orderId: created.order.id,
      amount: 280,
      method: "CASH",
      collectedByUserId: owner.id,
      collectedByName: owner.name,
    });
    assert.equal(pay.ok, true);
    const bill = await prisma.bill.findFirst({ where: { orderId: created.order.id, status: "FINALIZED" } });
    assert.ok(bill);
    assert.equal(bill!.grandTotal, 280);
    const itemsAfter = await prisma.orderItem.findMany({ where: { orderId: created.order.id } });
    assert.ok(itemsAfter.every((item) => item.status === "READY"));
  });

  it("TABLE_SERVICE bill still counts served items only", async () => {
    const suffix = `tsbill-${Date.now()}`;
    const { restaurant, table, burger } = await seedRestaurant(suffix, { serviceMode: "HYBRID" });
    const owner = await createStaff(restaurant, "OWNER", suffix);
    const created = await createOrderForTable({
      tableId: table.id,
      restaurantId: restaurant.id,
      items: [{ menuItemId: burger.id, quantity: 1 }],
      requestedFulfillmentMode: "TABLE_SERVICE",
      placedByUserId: owner.id,
      placedByName: owner.name,
    });
    await markItemsReady(created.order.id);
    const result = await finalizeOrderBill({
      orderId: created.order.id,
      restaurantId: restaurant.id,
      actorUserId: owner.id,
      actorName: owner.name,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.bill.grandTotal, 0);
    }
  });

  it("SELF_PICKUP partial payment stays due and collection unlocks only after the remainder", async () => {
    const suffix = `partial-${Date.now()}`;
    const { restaurant, table, burger } = await seedRestaurant(suffix, { serviceMode: "SELF_SERVICE" });
    const owner = await createStaff(restaurant, "OWNER", suffix);
    const created = await createOrderForTable({
      tableId: table.id,
      restaurantId: restaurant.id,
      items: [{ menuItemId: burger.id, quantity: 1 }],
      placedByUserId: owner.id,
      placedByName: owner.name,
    });
    await markItemsReady(created.order.id);
    const first = await recordOrderPayment({
      orderId: created.order.id,
      amount: 100,
      method: "CASH",
      collectedByUserId: owner.id,
      collectedByName: owner.name,
    });
    assert.equal(first.ok, true);
    const afterPartial = await prisma.order.findUnique({ where: { id: created.order.id } });
    assert.equal(afterPartial?.paidAt, null);
    const partialElig = evaluateCollectionEligibility(
      (await loadOrderForCollection(prisma, restaurant.id, created.order.id))!,
    );
    assert.equal(partialElig.outstandingAmountPaise, 18000);
    assert.equal(partialElig.collectable, false);
    assert.equal(partialElig.denyReason, "PAYMENT_REQUIRED");
    await assert.rejects(
      () =>
        markSelfPickupCollected({
          restaurantId: restaurant.id,
          orderId: created.order.id,
          actor: { id: owner.id, role: "OWNER", name: owner.name },
        }),
      (err: unknown) => err instanceof SelfPickupCollectionError && err.code === "PAYMENT_REQUIRED",
    );

    const rest = await recordOrderPayment({
      orderId: created.order.id,
      amount: 180,
      method: "CASH",
      collectedByUserId: owner.id,
      collectedByName: owner.name,
    });
    assert.equal(rest.ok, true);
    const settledElig = evaluateCollectionEligibility(
      (await loadOrderForCollection(prisma, restaurant.id, created.order.id))!,
    );
    assert.equal(settledElig.outstandingAmountPaise, 0);
    assert.equal(settledElig.collectable, true);
    const collected = await markSelfPickupCollected({
      restaurantId: restaurant.id,
      orderId: created.order.id,
      actor: { id: owner.id, role: "OWNER", name: owner.name },
    });
    assert.ok(collected.collectedAt);
  });

  it("GST remainder blocks SELF_PICKUP handover until the canonical total is captured", async () => {
    const suffix = `gst-${Date.now()}`;
    const { restaurant, table } = await seedRestaurant(suffix, { serviceMode: "SELF_SERVICE" });
    const owner = await createStaff(restaurant, "OWNER", suffix);
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { receiptGstEnabled: true, receiptGstRate: 5 },
    });
    const category = await prisma.menuCategory.findFirst({ where: { restaurantId: restaurant.id } });
    assert.ok(category);
    const chai = await prisma.menuItem.create({
      data: { name: "Chai", price: 100, categoryId: category!.id },
    });
    const created = await createOrderForTable({
      tableId: table.id,
      restaurantId: restaurant.id,
      items: [{ menuItemId: chai.id, quantity: 1 }],
      placedByUserId: owner.id,
      placedByName: owner.name,
    });
    await markItemsReady(created.order.id);
    const first = await recordOrderPayment({
      orderId: created.order.id,
      amount: 100,
      method: "CASH",
      collectedByUserId: owner.id,
      collectedByName: owner.name,
    });
    assert.equal(first.ok, true);
    const bill = await prisma.bill.findFirst({ where: { orderId: created.order.id, status: "FINALIZED" } });
    assert.ok(bill);
    assert.equal(bill!.grandTotal, 105);
    const afterHundred = evaluateCollectionEligibility(
      (await loadOrderForCollection(prisma, restaurant.id, created.order.id))!,
    );
    assert.equal(afterHundred.outstandingAmountPaise, 500);
    assert.equal(afterHundred.denyReason, "PAYMENT_REQUIRED");
    await assert.rejects(
      () =>
        markSelfPickupCollected({
          restaurantId: restaurant.id,
          orderId: created.order.id,
          actor: { id: owner.id, role: "OWNER", name: owner.name },
        }),
      (err: unknown) =>
        err instanceof SelfPickupCollectionError &&
        err.code === "PAYMENT_REQUIRED" &&
        err.outstandingAmountPaise === 500,
    );

    const remainder = await recordOrderPayment({
      orderId: created.order.id,
      amount: 5,
      method: "CASH",
      collectedByUserId: owner.id,
      collectedByName: owner.name,
    });
    assert.equal(remainder.ok, true);
    const afterGst = evaluateCollectionEligibility(
      (await loadOrderForCollection(prisma, restaurant.id, created.order.id))!,
    );
    assert.equal(afterGst.outstandingAmountPaise, 0);
    assert.equal(afterGst.collectable, true);
    const collected = await markSelfPickupCollected({
      restaurantId: restaurant.id,
      orderId: created.order.id,
      actor: { id: owner.id, role: "OWNER", name: owner.name },
    });
    assert.ok(collected.collectedAt);
  });

  it("collection outstanding uses the finalized Bill, not a later item recompute", async () => {
    const suffix = `authbill-${Date.now()}`;
    const { restaurant, table, burger } = await seedRestaurant(suffix, { serviceMode: "SELF_SERVICE" });
    const owner = await createStaff(restaurant, "OWNER", suffix);
    const created = await createOrderForTable({
      tableId: table.id,
      restaurantId: restaurant.id,
      items: [{ menuItemId: burger.id, quantity: 1 }],
      placedByUserId: owner.id,
      placedByName: owner.name,
    });
    await markItemsReady(created.order.id);
    const pay = await recordOrderPayment({
      orderId: created.order.id,
      amount: 100,
      method: "CASH",
      collectedByUserId: owner.id,
      collectedByName: owner.name,
    });
    assert.equal(pay.ok, true);
    const bill = await prisma.bill.findFirst({ where: { orderId: created.order.id, status: "FINALIZED" } });
    assert.equal(bill?.grandTotal, 280);
    await prisma.orderItem.updateMany({
      where: { orderId: created.order.id },
      data: { unitPrice: 50 },
    });
    const elig = evaluateCollectionEligibility(
      (await loadOrderForCollection(prisma, restaurant.id, created.order.id))!,
    );
    assert.equal(elig.outstandingAmountPaise, 18000);
    assert.equal(elig.denyReason, "PAYMENT_REQUIRED");
  });

  it("concurrent Mark Collected claims one transition and one ORDER_COLLECTED event", async () => {
    const suffix = `cas-${Date.now()}`;
    const { restaurant, table, burger } = await seedRestaurant(suffix, { serviceMode: "SELF_SERVICE" });
    const owner = await createStaff(restaurant, "OWNER", suffix);
    const created = await createOrderForTable({
      tableId: table.id,
      restaurantId: restaurant.id,
      items: [{ menuItemId: burger.id, quantity: 1 }],
      placedByUserId: owner.id,
      placedByName: owner.name,
    });
    await markItemsReady(created.order.id);
    await recordOrderPayment({
      orderId: created.order.id,
      amount: 280,
      method: "CASH",
      collectedByUserId: owner.id,
      collectedByName: owner.name,
    });
    const actor = { id: owner.id, role: "OWNER", name: owner.name };
    const results = await Promise.allSettled([
      markSelfPickupCollected({ restaurantId: restaurant.id, orderId: created.order.id, actor }),
      markSelfPickupCollected({ restaurantId: restaurant.id, orderId: created.order.id, actor }),
    ]);
    assert.equal(results.every((result) => result.status === "fulfilled"), true);
    const collected = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
    assert.equal(collected.length, 2);
    assert.ok(collected[0]!.collectedAt);
    assert.equal(collected[0]!.collectedAt!.toISOString(), collected[1]!.collectedAt!.toISOString());
    const persisted = await prisma.order.findUnique({ where: { id: created.order.id } });
    assert.equal(persisted?.collectedAt?.toISOString(), collected[0]!.collectedAt!.toISOString());
    const collectedEvents = await prisma.platformAuditEvent.count({
      where: { action: "ORDER_COLLECTED", resourceId: created.order.id },
    });
    assert.equal(collectedEvents, 1);
  });
});

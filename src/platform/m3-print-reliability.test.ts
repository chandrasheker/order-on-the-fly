import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { NextRequest } from "next/server";
import type { PrismaClient } from "@/generated/prisma/client";
import type { HostTenantResolution } from "@/platform/host-tenant";
import { todayDateString } from "@/lib/utils";

const dbPath = path.join(os.tmpdir(), `tabletap-m3-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_URL = `file:${dbPath}`;
process.env.JWT_SECRET = process.env.JWT_SECRET || "m3-test-jwt-secret-must-be-32-chars!!";
process.env.PRINT_DELIVERY_MODE = "agent-pull";
delete process.env.PRINTER_AGENT_URL;

let prisma: PrismaClient;
let enqueueKitchenChitForOrder: typeof import("@/domains/printing/print-job-service").enqueueKitchenChitForOrder;
let enqueueIdempotentPrintJob: typeof import("@/domains/printing/print-job-service").enqueueIdempotentPrintJob;
let claimNextPrintJob: typeof import("@/domains/printing/print-job-service").claimNextPrintJob;
let reportPrintJobResult: typeof import("@/domains/printing/print-job-service").reportPrintJobResult;
let retryPrintJobForRestaurant: typeof import("@/domains/printing/print-job-service").retryPrintJobForRestaurant;
let reprintPrintJobForRestaurant: typeof import("@/domains/printing/print-job-service").reprintPrintJobForRestaurant;
let createPrinterAgent: typeof import("@/lib/printer-agent-service").createPrinterAgent;
let updatePrinterAgent: typeof import("@/lib/printer-agent-service").updatePrinterAgent;
let authenticatePrinterAgent: typeof import("@/lib/printer-agent-service").authenticatePrinterAgent;
let agentMatchesRestaurantHost: typeof import("@/lib/print-agent-host").agentMatchesRestaurantHost;
let canMutatePrinterAgentCredentials: typeof import("@/lib/auth").canMutatePrinterAgentCredentials;
let createOrderForTable: typeof import("@/lib/order-service").createOrderForTable;
let finalizeOrderBill: typeof import("@/lib/bill-service").finalizeOrderBill;
let recordOrderPayment: typeof import("@/lib/payment-allocation-service").recordOrderPayment;
let ackPost: typeof import("@/app/api/print/ack/route").POST;
let kitchenChitIdempotencyKey: typeof import("@/lib/print-constants").kitchenChitIdempotencyKey;
let customerBillIdempotencyKey: typeof import("@/lib/print-constants").customerBillIdempotencyKey;

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
    enqueueKitchenChitForOrder,
    enqueueIdempotentPrintJob,
    claimNextPrintJob,
    reportPrintJobResult,
    retryPrintJobForRestaurant,
    reprintPrintJobForRestaurant,
    kitchenChitIdempotencyKey,
    customerBillIdempotencyKey,
  } = await import("@/domains/printing/print-job-service"));
  ({ createPrinterAgent, updatePrinterAgent, authenticatePrinterAgent } = await import(
    "@/lib/printer-agent-service"
  ));
  ({ agentMatchesRestaurantHost } = await import("@/lib/print-agent-host"));
  ({ canMutatePrinterAgentCredentials } = await import("@/lib/auth"));
  ({ createOrderForTable } = await import("@/lib/order-service"));
  ({ finalizeOrderBill } = await import("@/lib/bill-service"));
  ({ recordOrderPayment } = await import("@/lib/payment-allocation-service"));
  ({ POST: ackPost } = await import("@/app/api/print/ack/route"));
});

after(async () => {
  if (prisma) await prisma.$disconnect().catch(() => undefined);
  for (const extra of ["", "-wal", "-shm", "-journal"]) {
    fs.rmSync(`${dbPath}${extra}`, { force: true });
  }
});

async function seedRestaurant(suffix: string, extras?: { gst?: boolean; footer?: string }) {
  const restaurant = await prisma.restaurant.create({
    data: {
      name: `R ${suffix}`,
      nameNormalized: `r ${suffix}`,
      slug: `r-${suffix}`,
      receiptGstEnabled: Boolean(extras?.gst),
      receiptGstRate: 5,
      receiptFooter: extras?.footer ?? "Thanks",
    },
  });
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
  branchId?: string | null;
}) {
  const order = await prisma.order.create({
    data: {
      orderNumber: params.orderNumber,
      restaurantId: params.restaurantId,
      tableId: params.tableId,
      branchId: params.branchId ?? null,
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

async function makeAgent(
  restaurantId: string,
  extras?: { name?: string; branchId?: string | null; targets?: string[] },
) {
  const created = await createPrinterAgent({
    restaurantId,
    name: extras?.name ?? "Kitchen Pi",
    branchId: extras?.branchId ?? null,
    allowedTargets: extras?.targets,
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error(created.error);
  const auth = await authenticatePrinterAgent(`Bearer ${created.token}`);
  assert.ok(auth);
  return { ...created, auth: auth! };
}

function restaurantHost(restaurantId: string, slug: string): HostTenantResolution {
  return {
    ok: true,
    kind: "restaurant",
    host: { kind: "restaurant", hostname: `${slug}.dvadtech.in`, slug, baseDomain: "dvadtech.in" },
    context: {
      tenantId: `t-${slug}`,
      restaurantId,
      restaurantName: slug,
      restaurantSlug: slug,
      branchId: null,
      floorId: null,
    },
  };
}

describe("M3 print reliability", () => {
  it("keeps KOT durable after an order when no printer agent exists", async () => {
    const suffix = `kot-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix);
    const created = await createOrderForTable({
      tableId: table.id,
      restaurantId: restaurant.id,
      items: [{ menuItemId: menuItem.id, quantity: 1 }],
      placedByUserId: "staff-1",
      placedByName: "Staff",
    });
    const jobs = await prisma.printJob.findMany({
      where: { restaurantId: restaurant.id, kind: "kitchen_chit" },
    });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.status, "PENDING");
    assert.equal(jobs[0]?.orderId, created.order.id);
    assert.equal(jobs[0]?.idempotencyKey, kitchenChitIdempotencyKey(created.order.id));
    assert.equal(jobs[0]?.target, "kitchen");
  });

  it("keeps bill print durable after payment when no printer agent exists", async () => {
    const suffix = `bill-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix, { gst: true });
    const order = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 1,
      unitPrice: 200,
    });
    const finalized = await finalizeOrderBill({
      orderId: order.id,
      restaurantId: restaurant.id,
    });
    assert.equal(finalized.ok, true);
    const paid = await recordOrderPayment({
      orderId: order.id,
      amount: 210,
      method: "CASH",
    });
    assert.ok("payment" in paid || paid);
    const jobs = await prisma.printJob.findMany({
      where: { restaurantId: restaurant.id, kind: "customer_bill" },
    });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.status, "PENDING");
    if (finalized.ok) {
      assert.equal(jobs[0]?.idempotencyKey, customerBillIdempotencyKey(finalized.bill.id));
      const payload = JSON.parse(jobs[0]!.payload);
      assert.equal(payload.billNumber, finalized.bill.billNumber);
    }
  });

  it("is idempotent for automatic enqueue and creates a new job on reprint", async () => {
    const suffix = `idemp-${Date.now()}`;
    const { restaurant } = await seedRestaurant(suffix);
    const first = await enqueueKitchenChitForOrder({
      restaurantId: restaurant.id,
      orderId: "order-a",
      orderNumber: 1,
      tableNumber: 4,
      items: [{ name: "Tea", quantity: 1 }],
    });
    const second = await enqueueKitchenChitForOrder({
      restaurantId: restaurant.id,
      orderId: "order-a",
      orderNumber: 1,
      tableNumber: 4,
      items: [{ name: "Tea", quantity: 1 }],
    });
    assert.equal(first.id, second.id);
    const reprint = await reprintPrintJobForRestaurant({
      jobId: first.id,
      restaurantId: restaurant.id,
    });
    assert.ok(reprint);
    assert.notEqual(reprint!.id, first.id);
    assert.notEqual(reprint!.ackToken, first.ackToken);
    assert.equal(reprint!.reprintOfPrintJobId, first.id);
    assert.equal(reprint!.payload, first.payload);
  });

  it("lets only one concurrent claim own a job", async () => {
    const suffix = `race-${Date.now()}`;
    const { restaurant } = await seedRestaurant(suffix);
    await enqueueKitchenChitForOrder({
      restaurantId: restaurant.id,
      orderId: `order-${suffix}`,
      orderNumber: 1,
      tableNumber: 1,
    });
    const a = await makeAgent(restaurant.id, { name: "Pi A" });
    const b = await makeAgent(restaurant.id, { name: "Pi B" });
    const [left, right] = await Promise.all([
      claimNextPrintJob(a.auth),
      claimNextPrintJob(b.auth),
    ]);
    const owners = [left.job, right.job].filter(Boolean);
    assert.equal(owners.length, 1);
    const sent = await prisma.printJob.findMany({
      where: { restaurantId: restaurant.id, status: "SENT" },
    });
    assert.equal(sent.length, 1);
    assert.ok(sent[0]?.claimedByAgentId === a.auth.id || sent[0]?.claimedByAgentId === b.auth.id);
  });

  it("isolates restaurants, branches, and logical targets", async () => {
    const abc = await seedRestaurant(`abc-${Date.now()}`);
    const xyz = await seedRestaurant(`xyz-${Date.now()}`);
    const abcJob = await enqueueKitchenChitForOrder({
      restaurantId: abc.restaurant.id,
      orderId: "abc-order",
      orderNumber: 1,
      tableNumber: 1,
    });
    await enqueueKitchenChitForOrder({
      restaurantId: xyz.restaurant.id,
      orderId: "xyz-order",
      orderNumber: 1,
      tableNumber: 1,
    });
    const abcAgent = await makeAgent(abc.restaurant.id, { name: "ABC" });
    const claimed = await claimNextPrintJob(abcAgent.auth);
    assert.equal(claimed.job?.id, abcJob.id);
    const xyzClaim = await claimNextPrintJob(abcAgent.auth);
    assert.equal(xyzClaim.job, null);
    const xyzResult = await reportPrintJobResult({
      agent: abcAgent.auth,
      jobId: (await prisma.printJob.findFirst({ where: { restaurantId: xyz.restaurant.id } }))!.id,
      claimToken: "nope",
      outcome: "ACKED",
    });
    assert.equal(xyzResult.ok, false);

    const branchA = await prisma.branch.create({
      data: { restaurantId: abc.restaurant.id, name: "Hyd A", slug: `a-${Date.now()}` },
    });
    const branchB = await prisma.branch.create({
      data: { restaurantId: abc.restaurant.id, name: "Hyd B", slug: `b-${Date.now()}` },
    });
    await enqueueIdempotentPrintJob({
      restaurantId: abc.restaurant.id,
      branchId: branchB.id,
      orderId: "branch-b",
      kind: "kitchen_chit",
      payload: { orderNumber: 9, tableNumber: 2 },
      idempotencyKey: "kot:branch-b:kitchen_chit",
    });
    const branchAgent = await makeAgent(abc.restaurant.id, {
      name: "Branch A",
      branchId: branchA.id,
      targets: ["kitchen"],
    });
    const branchClaim = await claimNextPrintJob(branchAgent.auth);
    assert.equal(branchClaim.job, null);

    const billOnly = await makeAgent(abc.restaurant.id, { name: "Bill", targets: ["bill"] });
    await enqueueIdempotentPrintJob({
      restaurantId: abc.restaurant.id,
      orderId: "bill-only",
      kind: "customer_bill",
      payload: { billNumber: "B-1" },
      idempotencyKey: "bill:bill-only:customer_bill",
    });
    const kitchenOnly = await makeAgent(abc.restaurant.id, { name: "Kitchen only", targets: ["kitchen"] });
    const kitchenSawBill = await claimNextPrintJob(kitchenOnly.auth);
    assert.notEqual(kitchenSawBill.job?.kind, "customer_bill");
    const billClaim = await claimNextPrintJob(billOnly.auth);
    assert.equal(billClaim.job?.kind, "customer_bill");
    assert.equal(billClaim.job?.target, "bill");
  });

  it("leases, recovers expired claims, and rejects stale results", async () => {
    const suffix = `lease-${Date.now()}`;
    const { restaurant } = await seedRestaurant(suffix);
    const job = await enqueueKitchenChitForOrder({
      restaurantId: restaurant.id,
      orderId: `lease-${suffix}`,
      orderNumber: 3,
      tableNumber: 8,
    });
    const a = await makeAgent(restaurant.id, { name: "A" });
    const b = await makeAgent(restaurant.id, { name: "B" });
    const first = await claimNextPrintJob(a.auth);
    assert.equal(first.job?.id, job.id);
    const duringLease = await claimNextPrintJob(b.auth);
    assert.equal(duringLease.job, null);

    await prisma.printJob.update({
      where: { id: job.id },
      data: { leaseExpiresAt: new Date(Date.now() - 1000) },
    });
    const reclaimed = await claimNextPrintJob(b.auth);
    assert.equal(reclaimed.job?.id, job.id);
    assert.ok(reclaimed.job?.claimToken);
    assert.notEqual(reclaimed.job?.claimToken, first.job?.claimToken);

    const stale = await reportPrintJobResult({
      agent: a.auth,
      jobId: job.id,
      claimToken: first.job!.claimToken,
      outcome: "ACKED",
    });
    assert.equal(stale.ok, false);
    const stillSent = await prisma.printJob.findUnique({ where: { id: job.id } });
    assert.equal(stillSent?.status, "SENT");
    assert.equal(stillSent?.claimedByAgentId, b.auth.id);
  });

  it("treats duplicate ACK as idempotent and never auto-returns ACKED to PENDING", async () => {
    const suffix = `ack-${Date.now()}`;
    const { restaurant } = await seedRestaurant(suffix);
    const job = await enqueueKitchenChitForOrder({
      restaurantId: restaurant.id,
      orderId: `ack-${suffix}`,
      orderNumber: 1,
      tableNumber: 1,
    });
    const agent = await makeAgent(restaurant.id);
    const claimed = await claimNextPrintJob(agent.auth);
    const first = await reportPrintJobResult({
      agent: agent.auth,
      jobId: job.id,
      claimToken: claimed.job!.claimToken,
      outcome: "ACKED",
    });
    const second = await reportPrintJobResult({
      agent: agent.auth,
      jobId: job.id,
      claimToken: claimed.job!.claimToken,
      outcome: "ACKED",
    });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    const retried = await retryPrintJobForRestaurant(job.id, restaurant.id);
    assert.equal(retried?.status, "ACKED");
    assert.equal(retried?.ackToken, job.ackToken);
  });

  it("applies backoff, exhausts retries, and allows manual retry of the same job", async () => {
    const suffix = `retry-${Date.now()}`;
    const { restaurant } = await seedRestaurant(suffix);
    const job = await enqueueKitchenChitForOrder({
      restaurantId: restaurant.id,
      orderId: `retry-${suffix}`,
      orderNumber: 1,
      tableNumber: 1,
    });
    await prisma.printJob.update({ where: { id: job.id }, data: { maxAttempts: 2 } });
    const agent = await makeAgent(restaurant.id);
    const firstClaim = await claimNextPrintJob(agent.auth);
    const failed = await reportPrintJobResult({
      agent: agent.auth,
      jobId: job.id,
      claimToken: firstClaim.job!.claimToken,
      outcome: "FAILED",
      errorCode: "PRINTER_OFFLINE",
    });
    assert.equal(failed.ok, true);
    if (failed.ok) {
      assert.equal(failed.job.status, "PENDING");
      assert.ok(failed.job.nextAttemptAt && failed.job.nextAttemptAt.getTime() > Date.now());
    }

    await prisma.printJob.update({
      where: { id: job.id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });
    const secondClaim = await claimNextPrintJob(agent.auth);
    const terminal = await reportPrintJobResult({
      agent: agent.auth,
      jobId: job.id,
      claimToken: secondClaim.job!.claimToken,
      outcome: "FAILED",
      errorCode: "PRINTER_OFFLINE",
    });
    assert.equal(terminal.ok, true);
    if (terminal.ok) assert.equal(terminal.job.status, "FAILED");

    const retried = await retryPrintJobForRestaurant(job.id, restaurant.id);
    assert.equal(retried?.id, job.id);
    assert.equal(retried?.ackToken, job.ackToken);
    assert.equal(retried?.status, "PENDING");
    assert.equal(retried?.attempts, 0);
  });

  it("keeps retry/reprint identities and immutable bill/KOT payloads", async () => {
    const suffix = `immut-${Date.now()}`;
    const { restaurant, table, menuItem } = await seedRestaurant(suffix, {
      gst: true,
      footer: "Original footer",
    });
    const order = await seedServedOrder({
      restaurantId: restaurant.id,
      tableId: table.id,
      menuItemId: menuItem.id,
      orderNumber: 11,
      unitPrice: 200,
    });
    const finalized = await finalizeOrderBill({
      orderId: order.id,
      restaurantId: restaurant.id,
    });
    assert.equal(finalized.ok, true);
    if (!finalized.ok) return;
    const original = await prisma.printJob.findFirst({
      where: { restaurantId: restaurant.id, kind: "customer_bill" },
    });
    assert.ok(original);
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { receiptGstRate: 18, receiptFooter: "New footer", receiptGstEnabled: false },
    });
    await prisma.menuItem.update({ where: { id: menuItem.id }, data: { price: 999 } });
    const reprint = await reprintPrintJobForRestaurant({
      jobId: original!.id,
      restaurantId: restaurant.id,
    });
    assert.ok(reprint);
    assert.notEqual(reprint!.id, original!.id);
    assert.notEqual(reprint!.ackToken, original!.ackToken);
    assert.equal(reprint!.payload, original!.payload);
    const payload = JSON.parse(reprint!.payload);
    assert.equal(payload.billNumber, finalized.bill.billNumber);
    assert.equal(payload.restaurant.footer, "Original footer");
    assert.equal(payload.financials.gstAmount, finalized.bill.gstAmount);
    assert.equal(payload.items[0].unitPrice, 200);

    const kot = await enqueueKitchenChitForOrder({
      restaurantId: restaurant.id,
      orderId: order.id,
      orderNumber: 11,
      tableNumber: 4,
      items: [{ name: "Tea", quantity: 2, notes: "hot" }],
    });
    const kotRetry = await retryPrintJobForRestaurant(kot.id, restaurant.id);
    assert.equal(kotRetry?.id, kot.id);
    assert.equal(kotRetry?.ackToken, kot.ackToken);
    assert.equal(kotRetry?.payload, kot.payload);
  });

  it("hashes agent tokens, shows them once, and enforces owner-only credential mutation", async () => {
    const suffix = `tok-${Date.now()}`;
    const { restaurant } = await seedRestaurant(suffix);
    assert.equal(canMutatePrinterAgentCredentials("OWNER"), true);
    assert.equal(canMutatePrinterAgentCredentials("MANAGER"), false);
    assert.equal(canMutatePrinterAgentCredentials("SERVER"), false);
    const created = await createPrinterAgent({ restaurantId: restaurant.id, name: "Pi" });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.match(created.token, /^tt_pa_/);
    const row = await prisma.printerAgent.findUnique({ where: { id: created.agent.id } });
    assert.ok(row);
    assert.notEqual(row!.tokenHash, created.token);
    assert.equal(row!.tokenHash, createHash("sha256").update(created.token).digest("hex"));
    const listed = await prisma.printerAgent.findUnique({ where: { id: created.agent.id } });
    assert.doesNotMatch(JSON.stringify(listed), new RegExp(created.token));

    const rotated = await updatePrinterAgent({
      restaurantId: restaurant.id,
      agentId: created.agent.id,
      rotateToken: true,
    });
    assert.equal(rotated.ok, true);
    if (rotated.ok) {
      assert.ok(rotated.token);
      assert.notEqual(rotated.token, created.token);
    }

    const revoked = await updatePrinterAgent({
      restaurantId: restaurant.id,
      agentId: created.agent.id,
      revoke: true,
    });
    assert.equal(revoked.ok, true);
    const auth = await authenticatePrinterAgent(`Bearer ${rotated.ok ? rotated.token : created.token}`);
    assert.equal(auth, null);
  });

  it("rejects a valid token on the wrong restaurant host", async () => {
    const abc = await seedRestaurant(`host-abc-${Date.now()}`);
    const xyz = await seedRestaurant(`host-xyz-${Date.now()}`);
    const created = await makeAgent(abc.restaurant.id, { name: "ABC host" });
    assert.equal(
      agentMatchesRestaurantHost(created.auth, restaurantHost(abc.restaurant.id, abc.restaurant.slug)),
      true,
    );
    assert.equal(
      agentMatchesRestaurantHost(created.auth, restaurantHost(xyz.restaurant.id, xyz.restaurant.slug)),
      false,
    );
    assert.equal(
      agentMatchesRestaurantHost(created.auth, {
        ok: true,
        kind: "reserved",
        host: { kind: "reserved", hostname: "dvadtech.in", legacyRestaurantScoping: false },
      }),
      false,
    );
  });

  it("fails closed for production legacy ACK when the shared secret is missing", async () => {
    const previousMode = process.env.PRINT_DELIVERY_MODE;
    const previousSecret = process.env.PRINTER_AGENT_SECRET;
    const previousEnv = process.env.NODE_ENV;
    process.env.PRINT_DELIVERY_MODE = "legacy-push";
    delete process.env.PRINTER_AGENT_SECRET;
    process.env.NODE_ENV = "production";
    try {
      const req = new NextRequest("http://localhost/api/print/ack", {
        method: "POST",
        body: JSON.stringify({ ackToken: "anything" }),
        headers: { "content-type": "application/json" },
      });
      const res = await ackPost(req);
      assert.equal(res.status, 401);
    } finally {
      process.env.PRINT_DELIVERY_MODE = previousMode;
      process.env.NODE_ENV = previousEnv;
      if (previousSecret === undefined) delete process.env.PRINTER_AGENT_SECRET;
      else process.env.PRINTER_AGENT_SECRET = previousSecret;
    }
  });
});

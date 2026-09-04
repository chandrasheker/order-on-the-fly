import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { cupsSpawnSpec } from "../lib/adapters.mjs";
import { redactLogs, nextBackoff, assertServerUrl } from "../lib/client.mjs";
import { processClaimedJob } from "../lib/process-job.mjs";
import { readJobState, writeJobState } from "../lib/state.mjs";
import { renderJob } from "../lib/render.mjs";

const dirs = [];

function tempState() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tt-pa-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function kitchenJob(overrides = {}) {
  return {
    id: "job-1",
    deliveryKey: "ack-job-1",
    claimToken: "claim-1",
    kind: "kitchen_chit",
    target: "kitchen",
    payloadVersion: 1,
    payload: {
      orderNumber: 7,
      tableNumber: 3,
      items: [{ name: "Tea", quantity: 2, notes: "less sugar" }],
      createdAt: "2026-09-04T10:00:00.000Z",
    },
    ...overrides,
  };
}

describe("printer-agent processing", () => {
  it("invokes the adapter once and records PRINTED + ACKED", async () => {
    const stateDir = tempState();
    let calls = 0;
    const result = await processClaimedJob({
      job: kitchenJob(),
      mapping: { adapter: "fake", printer: "KITCHEN" },
      stateDir,
      adapter: async () => {
        calls += 1;
        return { ok: true, spoolId: "spool-1" };
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.outcome, "ACKED");
    assert.equal(result.printed, true);
    assert.equal(readJobState(stateDir, "ack-job-1")?.status, "PRINTED");
  });

  it("does not print a redelivered job and can ACK again", async () => {
    const stateDir = tempState();
    let calls = 0;
    const adapter = async () => {
      calls += 1;
      return { ok: true };
    };
    const first = await processClaimedJob({
      job: kitchenJob(),
      mapping: { adapter: "fake", printer: "KITCHEN" },
      stateDir,
      adapter,
    });
    const second = await processClaimedJob({
      job: kitchenJob(),
      mapping: { adapter: "fake", printer: "KITCHEN" },
      stateDir,
      adapter,
    });
    assert.equal(first.outcome, "ACKED");
    assert.equal(second.outcome, "ACKED");
    assert.equal(second.printed, false);
    assert.equal(second.reason, "deduped");
    assert.equal(calls, 1);
  });

  it("prints an explicit reprint with a new delivery key", async () => {
    const stateDir = tempState();
    let calls = 0;
    const adapter = async () => {
      calls += 1;
      return { ok: true };
    };
    await processClaimedJob({
      job: kitchenJob(),
      mapping: { adapter: "fake" },
      stateDir,
      adapter,
    });
    const reprint = await processClaimedJob({
      job: kitchenJob({ id: "job-2", deliveryKey: "ack-job-2" }),
      mapping: { adapter: "fake" },
      stateDir,
      adapter,
    });
    assert.equal(reprint.outcome, "ACKED");
    assert.equal(reprint.printed, true);
    assert.equal(calls, 2);
  });

  it("does not mark PRINTED after a definite adapter failure", async () => {
    const stateDir = tempState();
    const result = await processClaimedJob({
      job: kitchenJob(),
      mapping: { adapter: "fake" },
      stateDir,
      adapter: async () => ({
        ok: false,
        errorCode: "PRINTER_OFFLINE",
        errorMessage: "Printer offline",
      }),
    });
    assert.equal(result.outcome, "FAILED");
    assert.equal(result.errorCode, "PRINTER_OFFLINE");
    assert.notEqual(readJobState(stateDir, "ack-job-1")?.status, "PRINTED");
  });

  it("does not call the adapter for an unmapped target", async () => {
    const stateDir = tempState();
    let calls = 0;
    const result = await processClaimedJob({
      job: kitchenJob(),
      mapping: undefined,
      stateDir,
      adapter: async () => {
        calls += 1;
        return { ok: true };
      },
    });
    assert.equal(calls, 0);
    assert.equal(result.outcome, "FAILED");
    assert.equal(result.errorCode, "PRINTER_NOT_CONFIGURED");
  });

  it("does not reprint when local state is IN_PROGRESS after a crash", async () => {
    const stateDir = tempState();
    writeJobState(stateDir, "ack-job-1", { status: "IN_PROGRESS", jobId: "job-1" });
    let calls = 0;
    const result = await processClaimedJob({
      job: kitchenJob(),
      mapping: { adapter: "fake" },
      stateDir,
      adapter: async () => {
        calls += 1;
        return { ok: true };
      },
    });
    assert.equal(calls, 0);
    assert.equal(result.outcome, "AMBIGUOUS");
    assert.equal(result.errorCode, "AMBIGUOUS_DELIVERY");
  });

  it("never emits the bearer token in redacted logs", () => {
    const token = "tt_pa_agent123_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const redacted = redactLogs([`Authorization Bearer ${token}`, { token }]);
    assert.equal(String(redacted[0]).includes(token), false);
    assert.match(String(redacted[0]), /tt_pa_\[redacted\]/);
  });

  it("passes CUPS printer names as process arguments without a shell", () => {
    const spec = cupsSpawnSpec("KITCHEN_PRINTER");
    assert.equal(spec.command, "lp");
    assert.deepEqual(spec.args, ["-d", "KITCHEN_PRINTER"]);
    assert.equal(spec.options.shell, false);
    assert.equal(JSON.stringify(spec).includes("lp -d"), false);
  });

  it("requires HTTPS for remote URLs even when NODE_ENV is unset", () => {
    const previous = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    try {
      assert.equal(assertServerUrl("https://abc.dvadtech.in").startsWith("https://"), true);
      assert.equal(assertServerUrl("http://localhost:3000").includes("localhost"), true);
      assert.equal(assertServerUrl("http://127.0.0.1:3000").includes("127.0.0.1"), true);
      assert.throws(() => assertServerUrl("http://abc.dvadtech.in"));
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  it("caps reconnect backoff", () => {
    let delay = 0;
    const seen = [];
    for (let i = 0; i < 8; i += 1) {
      delay = nextBackoff(delay);
      seen.push(delay);
    }
    assert.deepEqual(seen.slice(0, 5), [2000, 5000, 10000, 20000, 30000]);
    assert.equal(seen[7], 30000);
  });

  it("renders kitchen and bill tickets from the existing payload", () => {
    const kot = renderJob(kitchenJob());
    assert.match(kot, /KITCHEN TICKET/);
    assert.match(kot, /Order #7/);
    assert.match(kot, /2 x Tea/);
    const bill = renderJob({
      kind: "customer_bill",
      payload: {
        billNumber: "20260904-001",
        restaurant: { name: "Cafe", footer: "Thanks" },
        order: { orderNumber: 7, tableNumber: 3 },
        items: [{ name: "Tea", quantity: 1, lineTotal: 200 }],
        financials: { taxableSubtotal: 200, gstAmount: 10, cgstAmount: 5, sgstAmount: 5, grandTotal: 210 },
      },
    });
    assert.match(bill, /Bill 20260904-001/);
    assert.match(bill, /TOTAL  210/);
    assert.match(bill, /Thanks/);
  });
});

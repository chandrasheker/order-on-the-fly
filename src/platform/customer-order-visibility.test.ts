import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { customerOrdersToDisplay, isLiveCustomerOrder } from "@/lib/utils";

const item = (status: string, unitPrice = 100) => ({
  status,
  unitPrice,
  quantity: 1,
});

describe("customer order visibility", () => {
  it("hides collected pickup and paid closed dine-in history", () => {
    const collected = {
      fulfillmentMode: "SELF_PICKUP",
      paidAt: "2026-09-16",
      items: [item("SERVED")],
      pickup: { pickupState: "COLLECTED" as const },
    };
    const paidDineIn = {
      fulfillmentMode: "TABLE_SERVICE",
      paidAt: "2026-09-16",
      items: [item("SERVED")],
      pickup: { pickupState: null },
    };
    const cooking = {
      fulfillmentMode: "TABLE_SERVICE",
      paidAt: null,
      items: [item("PREPARING")],
      pickup: { pickupState: null },
    };
    assert.equal(isLiveCustomerOrder(collected), false);
    assert.equal(isLiveCustomerOrder(paidDineIn), false);
    assert.equal(isLiveCustomerOrder(cooking), true);
    assert.deepEqual(
      customerOrdersToDisplay([collected, paidDineIn, cooking]),
      [cooking],
    );
  });

  it("hides leftover unpaid dine-in while a new pickup or cooking order is live", () => {
    const leftoverBill = {
      fulfillmentMode: "TABLE_SERVICE",
      paidAt: null,
      items: [item("SERVED")],
      pickup: { pickupState: null },
    };
    const pickup = {
      fulfillmentMode: "SELF_PICKUP",
      paidAt: null,
      items: [item("PENDING")],
      pickup: { pickupState: "AWAITING_PAYMENT" as const },
    };
    const cooking = {
      fulfillmentMode: "TABLE_SERVICE",
      paidAt: null,
      items: [item("PENDING")],
      pickup: { pickupState: null },
    };
    assert.deepEqual(customerOrdersToDisplay([leftoverBill, pickup]), [pickup]);
    assert.deepEqual(customerOrdersToDisplay([leftoverBill, cooking]), [cooking]);
  });

  it("shows the unpaid bill only after current kitchen work is done", () => {
    const leftoverBill = {
      fulfillmentMode: "TABLE_SERVICE",
      paidAt: null,
      items: [item("SERVED")],
      pickup: { pickupState: null },
    };
    assert.deepEqual(customerOrdersToDisplay([leftoverBill]), [leftoverBill]);
  });
});

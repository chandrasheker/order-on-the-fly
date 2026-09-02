import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dineInTablesWhere,
  isDineInTable,
  SERVICE_TABLE_DEFS,
  SERVICE_TABLE_NUMBER_FLOOR,
} from "@/lib/order-channel";

describe("dine-in table QR filter", () => {
  it("keeps guest tables and excludes service counters", () => {
    assert.equal(isDineInTable({ kind: "DINE_IN", number: 1 }), true);
    assert.equal(isDineInTable({ kind: "DINE_IN", number: 12 }), true);
    assert.equal(isDineInTable({ number: 6 }), true);
    for (const def of SERVICE_TABLE_DEFS) {
      assert.equal(isDineInTable(def), false);
    }
  });

  it("scopes QR queries to dine-in tables for that restaurant", () => {
    assert.deepEqual(dineInTablesWhere("rest-1"), {
      restaurantId: "rest-1",
      kind: "DINE_IN",
      number: { lt: SERVICE_TABLE_NUMBER_FLOOR },
    });
  });
});

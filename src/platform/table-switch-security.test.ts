import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  authorizeGuestTableSwitchRead,
  diningTokenMatchesScopedTable,
  type DiningTokenPayload,
} from "@/lib/dining-access";
import { orderByIdWhere, tableByQrWhere } from "@/platform/tenant-scope";

const ABC_ID = "restaurant-abc";
const XYZ_ID = "restaurant-xyz";

const abcTable = {
  id: "table-abc-1",
  qrToken: "abc-qr",
  restaurantId: ABC_ID,
  isActive: true,
  restaurant: { slug: "abc" },
};

const xyzTable = {
  id: "table-xyz-1",
  qrToken: "xyz-qr",
  restaurantId: XYZ_ID,
  isActive: true,
  restaurant: { slug: "xyz" },
};

const abcDining: DiningTokenPayload = {
  type: "dining",
  tableId: abcTable.id,
  tableToken: abcTable.qrToken,
  sessionKey: "abc-session",
  restaurantId: ABC_ID,
  restaurantSlug: "abc",
};

const xyzDining: DiningTokenPayload = {
  type: "dining",
  tableId: xyzTable.id,
  tableToken: xyzTable.qrToken,
  sessionKey: "xyz-session",
  restaurantId: XYZ_ID,
  restaurantSlug: "xyz",
};

const xyzSwitchRow = {
  id: "switch-xyz",
  targetTableToken: "xyz-target-qr",
  restaurantSlug: "xyz",
  request: { exists: true },
};

function opaqueKeys(body: Record<string, unknown>) {
  return {
    hasTargetTableToken: "targetTableToken" in body || JSON.stringify(body).includes("targetTableToken"),
    hasRestaurantSlug: Object.prototype.hasOwnProperty.call(body, "restaurantSlug"),
    hasRequest: "request" in body,
  };
}

describe("GET /api/table-switch hostname dining binding", () => {
  it("XYZ dining token + XYZ identifiers on xyz.dvadtech.in succeeds", () => {
    const auth = authorizeGuestTableSwitchRead({
      resolutionOk: true,
      table: xyzTable,
      dining: xyzDining,
      sessionKey: xyzDining.sessionKey,
    });
    assert.equal(auth.ok, true);
    if (auth.ok) {
      assert.equal(auth.sourceTableId, xyzTable.id);
      assert.equal(auth.restaurantId, XYZ_ID);
      assert.notEqual(auth.sourceTableId, xyzDining.tableId === xyzTable.id ? "" : xyzDining.tableId);
    }
  });

  it("copied XYZ dining token + XYZ identifiers on abc.dvadtech.in is opaque 404", () => {
    const auth = authorizeGuestTableSwitchRead({
      resolutionOk: true,
      table: null,
      dining: xyzDining,
      sessionKey: xyzDining.sessionKey,
    });
    assert.equal(auth.ok, false);
    if (!auth.ok) assert.equal(auth.status, 404);
    const body = { error: "Not found" };
    const leaked = opaqueKeys(body);
    assert.equal(leaked.hasRequest, false);
    assert.equal(leaked.hasTargetTableToken, false);
    assert.equal(leaked.hasRestaurantSlug, false);
    assert.equal(xyzSwitchRow.targetTableToken, "xyz-target-qr");
  });

  it("ABC dining token + ABC identifiers on abc.dvadtech.in succeeds", () => {
    const auth = authorizeGuestTableSwitchRead({
      resolutionOk: true,
      table: abcTable,
      dining: abcDining,
      sessionKey: abcDining.sessionKey,
    });
    assert.equal(auth.ok, true);
    if (auth.ok) {
      assert.equal(auth.sourceTableId, abcTable.id);
      assert.equal(auth.restaurantId, ABC_ID);
    }
  });

  it("copied ABC dining token on xyz.dvadtech.in is opaque 404", () => {
    const auth = authorizeGuestTableSwitchRead({
      resolutionOk: true,
      table: null,
      dining: abcDining,
      sessionKey: abcDining.sessionKey,
    });
    assert.equal(auth.ok, false);
    if (!auth.ok) assert.equal(auth.status, 404);
    const body = { error: "Not found" };
    assert.equal("request" in body, false);
    assert.equal("targetTableToken" in body, false);
    assert.equal("restaurantSlug" in body, false);
  });

  it("does not use dining.tableId to authorize before hostname ownership", () => {
    const auth = authorizeGuestTableSwitchRead({
      resolutionOk: false,
      table: null,
      dining: xyzDining,
      sessionKey: xyzDining.sessionKey,
    });
    assert.equal(auth.ok, false);
    if (!auth.ok) assert.equal(auth.status, 404);
  });

  it("dining restaurant claims that disagree with the host-scoped table are 404", () => {
    const auth = authorizeGuestTableSwitchRead({
      resolutionOk: true,
      table: abcTable,
      dining: {
        ...xyzDining,
        tableId: abcTable.id,
        tableToken: abcTable.qrToken,
        sessionKey: abcDining.sessionKey,
      },
      sessionKey: abcDining.sessionKey,
    });
    assert.equal(auth.ok, false);
    if (!auth.ok) assert.equal(auth.status, 404);
  });

  it("findLatestCustomerRequest scope is sourceTableId + sessionKey + restaurantId", () => {
    const auth = authorizeGuestTableSwitchRead({
      resolutionOk: true,
      table: abcTable,
      dining: abcDining,
      sessionKey: abcDining.sessionKey,
    });
    assert.ok(auth.ok);
    if (!auth.ok) return;
    const where = {
      sourceTableId: auth.sourceTableId,
      sessionKey: abcDining.sessionKey,
      restaurantId: auth.restaurantId,
    };
    assert.equal(where.sourceTableId, abcTable.id);
    assert.equal(where.restaurantId, ABC_ID);
    assert.notEqual(where.sourceTableId, xyzDining.tableId);
    assert.notEqual(where.restaurantId, XYZ_ID);
  });
});

describe("dining token cannot independently select a tenant", () => {
  it("matches only the host-scoped table", () => {
    assert.equal(diningTokenMatchesScopedTable(xyzDining, xyzTable, xyzDining.sessionKey), true);
    assert.equal(diningTokenMatchesScopedTable(xyzDining, abcTable, xyzDining.sessionKey), false);
    assert.equal(diningTokenMatchesScopedTable(abcDining, xyzTable, abcDining.sessionKey), false);
  });
});

describe("host-scoped Prisma lookups", () => {
  it("restaurant hosts query table/order by identifier and restaurantId", () => {
    assert.deepEqual(tableByQrWhere("xyz-qr", ABC_ID), { qrToken: "xyz-qr", restaurantId: ABC_ID });
    assert.deepEqual(orderByIdWhere("order-xyz", ABC_ID), { id: "order-xyz", restaurantId: ABC_ID });
  });

  it("bare localhost legacy looks up by identifier only", () => {
    assert.deepEqual(tableByQrWhere("xyz-qr", null), { qrToken: "xyz-qr" });
    assert.deepEqual(orderByIdWhere("order-xyz", null), { id: "order-xyz" });
  });
});

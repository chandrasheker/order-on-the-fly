import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  classifyHostname,
  selectOwnedResource,
  trustedRestaurantId,
  sessionMatchesHostSlug,
  pathSlugMatchesHost,
} from "@/platform/host";
import {
  clearHostTenantCache,
  resolveTenantFromClassifiedHost,
  requireTenantContext,
  HostTenantError,
  type HostTenantLookup,
  type RestaurantHostRow,
} from "@/platform/host-tenant";
import type { TenantContext } from "@/platform/tenant-context";

const ABC_ID = "restaurant-abc";
const XYZ_ID = "restaurant-xyz";
const TENANT_ABC = "tenant-abc";
const TENANT_XYZ = "tenant-xyz";

const restaurants: Record<string, RestaurantHostRow> = {
  abc: {
    id: ABC_ID,
    name: "ABC",
    slug: "abc",
    tenantId: TENANT_ABC,
    isEnabled: true,
    tenant: { id: TENANT_ABC, isEnabled: true },
  },
  xyz: {
    id: XYZ_ID,
    name: "XYZ",
    slug: "xyz",
    tenantId: TENANT_XYZ,
    isEnabled: true,
    tenant: { id: TENANT_XYZ, isEnabled: true },
  },
  disabled: {
    id: "restaurant-disabled",
    name: "Disabled",
    slug: "disabled",
    tenantId: TENANT_ABC,
    isEnabled: false,
    tenant: { id: TENANT_ABC, isEnabled: true },
  },
  orphan: {
    id: "restaurant-orphan",
    name: "Orphan",
    slug: "orphan",
    tenantId: null,
    isEnabled: true,
    tenant: null,
  },
};

function contextFor(row: RestaurantHostRow): TenantContext {
  return {
    tenantId: row.tenantId ?? "",
    restaurantId: row.id,
    restaurantName: row.name,
    restaurantSlug: row.slug,
    branchId: "branch-main",
    floorId: "floor-ground",
    branchName: "Main",
    floorName: "Ground Floor",
  };
}

let resolveContextCalls = 0;
let ensureTenantCalls = 0;

const lookup: HostTenantLookup = {
  async findRestaurantBySlug(slug) {
    return restaurants[slug] ?? null;
  },
  async resolveContext(row) {
    resolveContextCalls += 1;
    if (!row.tenantId) {
      ensureTenantCalls += 1;
    }
    return contextFor(row);
  },
};

const tables = {
  abcQr: { id: "table-abc-1", qrToken: "abc-table-1", restaurantId: ABC_ID, number: 1, name: "Table 1" },
  xyzQr: { id: "table-xyz-1", qrToken: "xyz-table-1", restaurantId: XYZ_ID, number: 1, name: "Table 1" },
};

const menuItems = {
  abcBurger: { id: "item-abc-burger", name: "Burger", restaurantId: ABC_ID, category: "Main Course" },
  xyzBurger: { id: "item-xyz-burger", name: "Burger", restaurantId: XYZ_ID, category: "Main Course" },
};

const orders = {
  abc: { id: "order-abc-1", restaurantId: ABC_ID },
  xyz: { id: "order-xyz-1", restaurantId: XYZ_ID },
};

afterEach(() => {
  clearHostTenantCache();
  resolveContextCalls = 0;
  ensureTenantCalls = 0;
});

function host(name: string) {
  return classifyHostname(name, { baseDomain: "dvadtech.in" });
}

describe("host resolution", () => {
  it("abc.dvadtech.in -> ABC", async () => {
    const result = await resolveTenantFromClassifiedHost(host("abc.dvadtech.in"), lookup);
    assert.equal(result.ok, true);
    if (result.ok && result.kind === "restaurant") {
      assert.equal(result.context.restaurantId, ABC_ID);
      assert.equal(result.context.restaurantSlug, "abc");
      assert.equal(result.context.tenantId, TENANT_ABC);
    }
  });

  it("xyz.dvadtech.in -> XYZ", async () => {
    const result = await resolveTenantFromClassifiedHost(host("xyz.dvadtech.in"), lookup);
    assert.equal(result.ok, true);
    if (result.ok && result.kind === "restaurant") {
      assert.equal(result.context.restaurantId, XYZ_ID);
      assert.equal(result.context.restaurantSlug, "xyz");
    }
  });

  it("unknown.dvadtech.in -> rejected", async () => {
    const result = await resolveTenantFromClassifiedHost(host("unknown.dvadtech.in"), lookup);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "UNKNOWN_SUBDOMAIN");
  });

  it("disabled restaurant host fails closed", async () => {
    const result = await resolveTenantFromClassifiedHost(host("disabled.dvadtech.in"), lookup);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "RESTAURANT_DISABLED");
  });

  it("missing tenantId is INVALID_HIERARCHY and does not repair tenancy", async () => {
    const result = await resolveTenantFromClassifiedHost(host("orphan.dvadtech.in"), lookup);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "INVALID_HIERARCHY");
    assert.equal(resolveContextCalls, 0);
    assert.equal(ensureTenantCalls, 0);
  });

  it("requireTenantContext throws on reserved and unknown hosts", async () => {
    const reservedHeaders = new Headers({ host: "localhost:3000" });
    await assert.rejects(() => requireTenantContext(reservedHeaders, lookup), HostTenantError);

    const unknownHeaders = new Headers({ host: "unknown.dvadtech.in" });
    process.env.TENANT_BASE_DOMAIN = "dvadtech.in";
    await assert.rejects(() => requireTenantContext(unknownHeaders, lookup), HostTenantError);
    delete process.env.TENANT_BASE_DOMAIN;
  });
});

describe("authentication host binding", () => {
  it("ABC JWT + ABC host -> success", () => {
    assert.equal(sessionMatchesHostSlug("abc", host("abc.dvadtech.in")), true);
  });

  it("ABC JWT + XYZ host -> rejected", () => {
    assert.equal(sessionMatchesHostSlug("abc", host("xyz.dvadtech.in")), false);
  });

  it("XYZ JWT + XYZ host -> success", () => {
    assert.equal(sessionMatchesHostSlug("xyz", host("xyz.dvadtech.in")), true);
  });

  it("XYZ JWT + ABC host -> rejected", () => {
    assert.equal(sessionMatchesHostSlug("xyz", host("abc.dvadtech.in")), false);
  });
});

describe("QR / table isolation", () => {
  it("ABC host + ABC QR -> success", async () => {
    const result = await resolveTenantFromClassifiedHost(host("abc.dvadtech.in"), lookup);
    const restaurantId = result.ok && result.kind === "restaurant" ? result.context.restaurantId : null;
    assert.ok(selectOwnedResource(restaurantId, tables.abcQr));
  });

  it("ABC host + XYZ QR -> rejected", async () => {
    const result = await resolveTenantFromClassifiedHost(host("abc.dvadtech.in"), lookup);
    const restaurantId = result.ok && result.kind === "restaurant" ? result.context.restaurantId : null;
    assert.equal(selectOwnedResource(restaurantId, tables.xyzQr), null);
  });

  it("XYZ host + XYZ QR -> success", async () => {
    const result = await resolveTenantFromClassifiedHost(host("xyz.dvadtech.in"), lookup);
    const restaurantId = result.ok && result.kind === "restaurant" ? result.context.restaurantId : null;
    assert.ok(selectOwnedResource(restaurantId, tables.xyzQr));
  });

  it("XYZ host + ABC QR -> rejected", async () => {
    const result = await resolveTenantFromClassifiedHost(host("xyz.dvadtech.in"), lookup);
    const restaurantId = result.ok && result.kind === "restaurant" ? result.context.restaurantId : null;
    assert.equal(selectOwnedResource(restaurantId, tables.abcQr), null);
  });
});

describe("resource-id isolation", () => {
  it("rejects ABC host access to XYZ order, table, menu item", async () => {
    const result = await resolveTenantFromClassifiedHost(host("abc.dvadtech.in"), lookup);
    const restaurantId = result.ok && result.kind === "restaurant" ? result.context.restaurantId : null;
    assert.equal(selectOwnedResource(restaurantId, orders.xyz), null);
    assert.equal(selectOwnedResource(restaurantId, tables.xyzQr), null);
    assert.equal(selectOwnedResource(restaurantId, menuItems.xyzBurger), null);
  });

  it("rejects guest/order actions that target the other restaurant", () => {
    const abcHost = host("abc.dvadtech.in");
    assert.equal(pathSlugMatchesHost("xyz", abcHost), false);
  });
});

describe("request injection", () => {
  it("keeps ABC trusted context when restaurantId=XYZ is injected", async () => {
    const result = await resolveTenantFromClassifiedHost(host("abc.dvadtech.in"), lookup);
    const hostId = result.ok && result.kind === "restaurant" ? result.context.restaurantId : null;
    assert.equal(trustedRestaurantId(hostId, XYZ_ID), ABC_ID);
    assert.equal(trustedRestaurantId(hostId, { restaurantId: XYZ_ID } as unknown as string), ABC_ID);
  });
});

describe("same-value collisions", () => {
  it("isolates Table 1 / Burger / Main Course across restaurants", async () => {
    const abc = await resolveTenantFromClassifiedHost(host("abc.dvadtech.in"), lookup);
    const xyz = await resolveTenantFromClassifiedHost(host("xyz.dvadtech.in"), lookup);
    const abcId = abc.ok && abc.kind === "restaurant" ? abc.context.restaurantId : null;
    const xyzId = xyz.ok && xyz.kind === "restaurant" ? xyz.context.restaurantId : null;

    const abcTable = selectOwnedResource(abcId, tables.abcQr);
    const xyzTable = selectOwnedResource(xyzId, tables.xyzQr);
    assert.equal(abcTable?.name, "Table 1");
    assert.equal(xyzTable?.name, "Table 1");
    assert.notEqual(abcTable?.id, xyzTable?.id);

    const abcBurger = selectOwnedResource(abcId, menuItems.abcBurger);
    const xyzBurger = selectOwnedResource(xyzId, menuItems.xyzBurger);
    assert.equal(abcBurger?.name, "Burger");
    assert.equal(xyzBurger?.name, "Burger");
    assert.equal(abcBurger?.category, "Main Course");
    assert.equal(xyzBurger?.category, "Main Course");
    assert.notEqual(abcBurger?.id, xyzBurger?.id);

    assert.equal(selectOwnedResource(abcId, tables.xyzQr), null);
    assert.equal(selectOwnedResource(abcId, menuItems.xyzBurger), null);
  });
});

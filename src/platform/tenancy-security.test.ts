import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  classifyHostname,
  sessionMatchesHostSlug,
  sessionAllowedFromHeaders,
  blocksRestaurantOperationsOnHost,
  allowsLegacyRestaurantScoping,
  allowsApexPublicLanding,
} from "@/platform/host";
import {
  resolveTenantFromClassifiedHost,
  clearHostTenantCache,
  hostHealthSummary,
  type HostTenantLookup,
  type RestaurantHostRow,
} from "@/platform/host-tenant";
import {
  scopeResourceForResolution,
  restaurantOpsAllowedOnResolution,
} from "@/platform/tenant-scope";
import {
  requireOwnedOrderItem,
  requireOwnedOrderItemWithoutPayment,
} from "@/lib/staff-order-item-actions";
import { scopedOrderItemIds, hasOnlyForeignOrderItemIds } from "@/lib/order-item-guard";
import { assertProductionSecurityConfig } from "@/config/app-config";
import { assertJwtSecretForEnv, getJwtSecretValue } from "@/lib/jwt-secret";
import type { TenantContext } from "@/platform/tenant-context";

const ABC_ID = "restaurant-abc";
const XYZ_ID = "restaurant-xyz";

const abcItem = { id: "item-abc-1", status: "READY", itemName: "Burger", expectedReadyAt: new Date() };
const xyzItem = { id: "item-xyz-1", status: "READY", itemName: "Pasta", expectedReadyAt: new Date() };

const abcOrder = {
  id: "order-abc-1",
  restaurantId: ABC_ID,
  items: [abcItem],
};

const xyzOrder = {
  id: "order-xyz-1",
  restaurantId: XYZ_ID,
  items: [xyzItem],
};

const itemDb: Record<string, { status: string }> = {
  [abcItem.id]: { status: abcItem.status },
  [xyzItem.id]: { status: xyzItem.status },
};

function resetItems() {
  itemDb[abcItem.id].status = "READY";
  itemDb[xyzItem.id].status = "READY";
}

const restaurants: Record<string, RestaurantHostRow> = {
  abc: {
    id: ABC_ID,
    name: "ABC",
    slug: "abc",
    tenantId: "tenant-abc",
    isEnabled: true,
    tenant: { id: "tenant-abc", isEnabled: true },
  },
  xyz: {
    id: XYZ_ID,
    name: "XYZ",
    slug: "xyz",
    tenantId: "tenant-xyz",
    isEnabled: true,
    tenant: { id: "tenant-xyz", isEnabled: true },
  },
  disabled: {
    id: "restaurant-disabled",
    name: "Disabled",
    slug: "disabled",
    tenantId: "tenant-abc",
    isEnabled: false,
    tenant: { id: "tenant-abc", isEnabled: true },
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

let mutatedTenants = 0;
const lookup: HostTenantLookup = {
  async findRestaurantBySlug(slug) {
    return restaurants[slug] ?? null;
  },
  async resolveContext(row): Promise<TenantContext> {
    if (!row.tenantId) mutatedTenants += 1;
    return {
      tenantId: row.tenantId ?? "repaired-tenant",
      restaurantId: row.id,
      restaurantName: row.name,
      restaurantSlug: row.slug,
      branchId: null,
      floorId: null,
    };
  },
};

function prodHost(name: string) {
  return classifyHostname(name, { baseDomain: "dvadtech.in", nodeEnv: "production" });
}

function abcResolution() {
  return resolveTenantFromClassifiedHost(prodHost("abc.dvadtech.in"), lookup);
}

afterEach(() => {
  clearHostTenantCache();
  mutatedTenants = 0;
  delete process.env.TENANT_APEX_RESTAURANT;
  delete process.env.TENANT_BASE_DOMAIN;
  delete process.env.APP_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("1-3 order item mutations are nested-resource scoped", () => {
  it("ABC host + ABC order + ABC item serve-item is allowed and mutates ABC", async () => {
    resetItems();
    const owned = requireOwnedOrderItem(abcOrder, abcItem.id, ABC_ID);
    assert.equal(owned.ok, true);
    if (!owned.ok) return;
    itemDb[owned.item.id].status = "SERVED";
    assert.equal(itemDb[abcItem.id].status, "SERVED");
    assert.equal(itemDb[xyzItem.id].status, "READY");
  });

  it("ABC host + ABC order + XYZ item serve-item is opaque 404 and XYZ is unchanged", async () => {
    resetItems();
    const owned = requireOwnedOrderItem(abcOrder, xyzItem.id, ABC_ID);
    assert.equal(owned.ok, false);
    if (!owned.ok) {
      assert.equal(owned.status, 404);
      assert.equal(owned.error, "Not found");
    }
    assert.equal(itemDb[xyzItem.id].status, "READY");
    assert.equal(itemDb[abcItem.id].status, "READY");
  });

  it("ABC host + ABC order + XYZ item reject-item is opaque, does not check payment, XYZ unchanged", async () => {
    resetItems();
    const paymentLookups: string[] = [];
    const result = await requireOwnedOrderItemWithoutPayment(
      abcOrder,
      xyzItem.id,
      ABC_ID,
      async (id) => {
        paymentLookups.push(id);
        return true;
      },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 404);
      assert.equal(result.error, "Not found");
    }
    assert.deepEqual(paymentLookups, []);
    assert.equal(itemDb[xyzItem.id].status, "READY");
  });

  it("same-restaurant reject-item may check payment on the owned item only", async () => {
    const paymentLookups: string[] = [];
    const result = await requireOwnedOrderItemWithoutPayment(
      abcOrder,
      abcItem.id,
      ABC_ID,
      async (id) => {
        paymentLookups.push(id);
        return false;
      },
    );
    assert.equal(result.ok, true);
    assert.deepEqual(paymentLookups, [abcItem.id]);
  });

  it("record-payment itemIds drop foreign IDs and reject all-foreign lists", () => {
    assert.deepEqual(scopedOrderItemIds(abcOrder, [abcItem.id, xyzItem.id]), [abcItem.id]);
    assert.equal(hasOnlyForeignOrderItemIds(abcOrder, [xyzItem.id]), true);
    assert.equal(hasOnlyForeignOrderItemIds(abcOrder, [abcItem.id]), false);
  });
});

describe("4 staff JWT host binding", () => {
  it("ABC staff session on XYZ restaurant host is rejected", async () => {
    const xyz = prodHost("xyz.dvadtech.in");
    assert.equal(sessionMatchesHostSlug("abc", xyz, "production"), false);
    assert.equal(
      await sessionAllowedFromHeaders("abc", async () => new Headers({ host: "xyz.dvadtech.in" }), "production"),
      false,
    );
  });

  it("inability to read the request host fails closed", async () => {
    await assert.equal(
      await sessionAllowedFromHeaders("abc", async () => {
        throw new Error("headers() unavailable");
      }),
      false,
    );
  });
});

describe("5-8 guest identifiers and host resolution", () => {
  it("XYZ guest QR/table/order on ABC host is opaque", async () => {
    const resolution = await abcResolution();
    assert.equal(resolution.ok, true);
    assert.equal(
      scopeResourceForResolution(resolution, { id: "table-xyz", restaurantId: XYZ_ID, qrToken: "xyz-qr" }),
      null,
    );
    assert.equal(
      scopeResourceForResolution(resolution, xyzOrder),
      null,
    );
    assert.ok(scopeResourceForResolution(resolution, { id: "table-abc", restaurantId: ABC_ID, qrToken: "abc-qr" }));
  });

  it("unknown restaurant subdomain is 404", async () => {
    const result = await resolveTenantFromClassifiedHost(prodHost("unknown.dvadtech.in"), lookup);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "UNKNOWN_SUBDOMAIN");
    const summary = hostHealthSummary(result);
    assert.equal(summary.ok, false);
    assert.equal(summary.slug, "unknown");
    assert.equal(summary.reason, "UNKNOWN_SUBDOMAIN");
  });

  it("disabled restaurant host is 404", async () => {
    const result = await resolveTenantFromClassifiedHost(prodHost("disabled.dvadtech.in"), lookup);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "RESTAURANT_DISABLED");
  });

  it("malformed hierarchy does not repair tenancy", async () => {
    mutatedTenants = 0;
    const result = await resolveTenantFromClassifiedHost(prodHost("orphan.dvadtech.in"), lookup);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "INVALID_HIERARCHY");
    assert.equal(mutatedTenants, 0);
    assert.equal(restaurantOpsAllowedOnResolution(result), false);
  });

  it("resolver/DB failures propagate instead of becoming a silent 404", async () => {
    clearHostTenantCache();
    const throwing: HostTenantLookup = {
      async findRestaurantBySlug() {
        throw new Error("db down");
      },
    };
    await assert.rejects(
      () => resolveTenantFromClassifiedHost(prodHost("abc.dvadtech.in"), throwing),
      /db down/,
    );
  });
});

describe("9-10 production fail-closed configuration and hosts", () => {
  const strongJwt = "production-jwt-secret-value-32chars-min";

  it("production without TENANT_BASE_DOMAIN cannot silently disable tenancy", () => {
    assert.throws(
      () =>
        assertProductionSecurityConfig({
          NODE_ENV: "production",
          JWT_SECRET: strongJwt,
          TENANT_BASE_DOMAIN: "",
        }),
      /TENANT_BASE_DOMAIN/,
    );
    assert.throws(
      () =>
        assertProductionSecurityConfig({
          NODE_ENV: "production",
          JWT_SECRET: strongJwt,
        }),
      /TENANT_BASE_DOMAIN/,
    );

    const classified = classifyHostname("abc.example.com", {
      baseDomain: "",
      nodeEnv: "production",
    });
    assert.equal(classified.kind, "invalid");
    if (classified.kind === "invalid") {
      assert.equal(classified.reason, "missing_tenant_base_domain");
    }
    assert.equal(blocksRestaurantOperationsOnHost(classified, "production"), true);
    assert.equal(sessionMatchesHostSlug("abc", classified, "production"), false);
  });

  it("production rejects missing, placeholder, and weak JWT secrets", () => {
    assert.throws(() => assertJwtSecretForEnv("production", ""), /JWT_SECRET/);
    assert.throws(
      () => assertJwtSecretForEnv("production", "tabletap-super-secret-key-change-in-production"),
      /JWT_SECRET/,
    );
    assert.throws(
      () => assertJwtSecretForEnv("production", "change-this-to-a-secure-random-string-in-production"),
      /JWT_SECRET/,
    );
    assert.throws(() => assertJwtSecretForEnv("production", "short-secret"), /JWT_SECRET/);
    assert.equal(assertJwtSecretForEnv("production", strongJwt), strongJwt);
  });

  it("TABLETAP_PRODUCTION_BUILD skips JWT throw the same way as next build", () => {
    const previous = process.env.TABLETAP_PRODUCTION_BUILD;
    process.env.TABLETAP_PRODUCTION_BUILD = "1";
    try {
      assert.doesNotThrow(() =>
        getJwtSecretValue({
          NODE_ENV: "production",
          JWT_SECRET: "change-this-to-a-secure-random-string-in-production",
        }),
      );
    } finally {
      if (previous === undefined) delete process.env.TABLETAP_PRODUCTION_BUILD;
      else process.env.TABLETAP_PRODUCTION_BUILD = previous;
    }
  });

  it("next build page-data collection does not throw on a placeholder JWT", () => {
    assert.doesNotThrow(() =>
      getJwtSecretValue({
        NODE_ENV: "production",
        JWT_SECRET: "change-this-to-a-secure-random-string-in-production",
        NEXT_PHASE: "phase-production-build",
      }),
    );
    assert.throws(
      () =>
        getJwtSecretValue({
          NODE_ENV: "production",
          JWT_SECRET: "change-this-to-a-secure-random-string-in-production",
        }),
      /JWT_SECRET/,
    );
  });

  it("development startup does not require TENANT_BASE_DOMAIN or a custom JWT", () => {
    assert.doesNotThrow(() =>
      assertProductionSecurityConfig({
        NODE_ENV: "development",
        JWT_SECRET: "",
        TENANT_BASE_DOMAIN: "",
      }),
    );
    assert.ok(assertJwtSecretForEnv("development", "").length > 0);
  });

  it("raw IP and unintended production hosts are not a restaurant tenancy bypass", () => {
    const rawIp = classifyHostname("203.0.113.20", { baseDomain: "dvadtech.in", nodeEnv: "production" });
    assert.equal(rawIp.kind, "invalid");
    assert.equal(blocksRestaurantOperationsOnHost(rawIp, "production"), true);
    assert.equal(allowsLegacyRestaurantScoping(rawIp, "production"), false);
    assert.equal(sessionMatchesHostSlug("abc", rawIp, "production"), false);

    const apex = classifyHostname("dvadtech.in", { baseDomain: "dvadtech.in", nodeEnv: "production" });
    assert.equal(apex.kind, "reserved");
    assert.equal(blocksRestaurantOperationsOnHost(apex, "production"), true);
    assert.equal(allowsLegacyRestaurantScoping(apex, "production"), false);
    assert.equal(sessionMatchesHostSlug("abc", apex, "production"), false);
    assert.equal(
      scopeResourceForResolution(
        { ok: true, kind: "reserved", host: apex },
        { id: "table-abc", restaurantId: ABC_ID },
      ),
      null,
    );

    const unknown = classifyHostname("evil.example.net", {
      baseDomain: "dvadtech.in",
      nodeEnv: "production",
    });
    assert.equal(unknown.kind, "invalid");
    assert.equal(blocksRestaurantOperationsOnHost(unknown, "production"), true);
    assert.equal(allowsApexPublicLanding("/", unknown, { baseDomain: "dvadtech.in" }), false);
    assert.equal(allowsApexPublicLanding("/", apex, { baseDomain: "dvadtech.in" }), true);
  });

  it("TENANT_APEX_RESTAURANT does not reopen unknown hosts or raw IPs", () => {
    process.env.TENANT_APEX_RESTAURANT = "1";
    process.env.TENANT_BASE_DOMAIN = "dvadtech.in";
    const apex = classifyHostname("dvadtech.in", { baseDomain: "dvadtech.in", nodeEnv: "production" });
    const rawIp = classifyHostname("203.0.113.20", { baseDomain: "dvadtech.in", nodeEnv: "production" });
    const unknown = classifyHostname("evil.example.net", {
      baseDomain: "dvadtech.in",
      nodeEnv: "production",
    });
    assert.equal(allowsLegacyRestaurantScoping(apex, "production"), true);
    assert.equal(blocksRestaurantOperationsOnHost(apex, "production"), false);
    assert.equal(allowsLegacyRestaurantScoping(rawIp, "production"), false);
    assert.equal(blocksRestaurantOperationsOnHost(rawIp, "production"), true);
    assert.equal(allowsLegacyRestaurantScoping(unknown, "production"), false);
    assert.equal(blocksRestaurantOperationsOnHost(unknown, "production"), true);
  });
});

describe("11-12 development localhost isolation", () => {
  it("abc.localhost:3000 is strict ABC isolation", async () => {
    const host = classifyHostname("abc.localhost:3000", { nodeEnv: "development" });
    assert.equal(host.kind, "restaurant");
    if (host.kind === "restaurant") assert.equal(host.slug, "abc");

    const resolution = await resolveTenantFromClassifiedHost(host, lookup);
    assert.equal(resolution.ok, true);
    assert.ok(scopeResourceForResolution(resolution, { id: "t-abc", restaurantId: ABC_ID }));
    assert.equal(scopeResourceForResolution(resolution, { id: "t-xyz", restaurantId: XYZ_ID }), null);
    assert.equal(sessionMatchesHostSlug("abc", host, "development"), true);
    assert.equal(sessionMatchesHostSlug("xyz", host, "development"), false);
    assert.equal(requireOwnedOrderItem(abcOrder, xyzItem.id, ABC_ID).ok, false);
  });

  it("bare localhost keeps legacy path/session restaurant scoping", () => {
    const host = classifyHostname("localhost:3000", { nodeEnv: "development" });
    assert.equal(host.kind, "reserved");
    assert.equal(allowsLegacyRestaurantScoping(host, "development"), true);
    assert.equal(blocksRestaurantOperationsOnHost(host, "development"), false);
    assert.equal(sessionMatchesHostSlug("abc", host, "development"), true);

    const scoped = scopeResourceForResolution(
      { ok: true, kind: "reserved", host },
      { id: "t-abc", restaurantId: ABC_ID },
    );
    assert.ok(scoped);
    assert.equal(scoped?.restaurantId, ABC_ID);
  });
});

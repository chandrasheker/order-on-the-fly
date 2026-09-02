import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { classifyHostname, restaurantSlugValidationError } from "@/platform/host";
import {
  clearHostTenantCache,
  invalidateHostTenantCache,
  invalidateHostTenantCacheForSlugs,
  resolveTenantFromClassifiedHost,
  type HostTenantLookup,
  type RestaurantHostRow,
} from "@/platform/host-tenant";
import { getRestaurantPublicBaseUrl } from "@/lib/server-app-url";
import { signupTenantWithRestaurant } from "@/lib/tenant-onboarding-service";
import type { TenantContext } from "@/platform/tenant-context";

const originalEnv = { ...process.env };
const restaurants: Record<string, RestaurantHostRow> = {};

function contextFor(row: RestaurantHostRow): TenantContext {
  return {
    tenantId: row.tenantId ?? "",
    restaurantId: row.id,
    restaurantName: row.name,
    restaurantSlug: row.slug,
    branchId: "branch-main",
    floorId: "floor-ground",
  };
}

const lookup: HostTenantLookup = {
  async findRestaurantBySlug(slug) {
    return restaurants[slug] ?? null;
  },
  async resolveContext(row) {
    return contextFor(row);
  },
};

function prodHost(name: string) {
  return classifyHostname(name, { baseDomain: "dvadtech.in", nodeEnv: "production" });
}

function putRestaurant(row: RestaurantHostRow) {
  restaurants[row.slug] = row;
}

afterEach(() => {
  clearHostTenantCache();
  for (const key of Object.keys(restaurants)) delete restaurants[key];
  process.env.TENANT_BASE_DOMAIN = originalEnv.TENANT_BASE_DOMAIN;
  process.env.APP_URL = originalEnv.APP_URL;
  process.env.TENANT_PUBLIC_PROTOCOL = originalEnv.TENANT_PUBLIC_PROTOCOL;
  process.env.TENANT_PUBLIC_PORT = originalEnv.TENANT_PUBLIC_PORT;
});

describe("onboarding hostname activation", () => {
  it("new tenant first restaurant fp-south is enabled and belongs to the tenant", async () => {
    putRestaurant({
      id: "rest-fp-south",
      name: "FP South",
      slug: "fp-south",
      tenantId: "tenant-fp-south",
      isEnabled: true,
      tenant: { id: "tenant-fp-south", isEnabled: true },
    });

    const resolved = await resolveTenantFromClassifiedHost(prodHost("fp-south.dvadtech.in"), lookup);
    assert.equal(resolved.ok, true);
    if (resolved.ok && resolved.kind === "restaurant") {
      assert.equal(resolved.context.restaurantId, "rest-fp-south");
      assert.equal(resolved.context.tenantId, "tenant-fp-south");
      assert.equal(resolved.context.restaurantSlug, "fp-south");
    }
    assert.equal(restaurants["fp-south"]?.isEnabled, true);
    assert.equal(restaurants["fp-south"]?.tenant?.isEnabled, true);
  });

  it("UNKNOWN_SUBDOMAIN cache is cleared by targeted invalidation after create", async () => {
    const unknown = await resolveTenantFromClassifiedHost(prodHost("fp-south.dvadtech.in"), lookup);
    assert.equal(unknown.ok, false);
    if (!unknown.ok) assert.equal(unknown.reason, "UNKNOWN_SUBDOMAIN");

    putRestaurant({
      id: "rest-fp-south",
      name: "FP South",
      slug: "fp-south",
      tenantId: "tenant-fp-south",
      isEnabled: true,
      tenant: { id: "tenant-fp-south", isEnabled: true },
    });

    const stillCached = await resolveTenantFromClassifiedHost(prodHost("fp-south.dvadtech.in"), lookup);
    assert.equal(stillCached.ok, false);

    invalidateHostTenantCache("fp-south");
    const fresh = await resolveTenantFromClassifiedHost(prodHost("fp-south.dvadtech.in"), lookup);
    assert.equal(fresh.ok, true);
    if (fresh.ok && fresh.kind === "restaurant") {
      assert.equal(fresh.context.restaurantSlug, "fp-south");
    }
  });

  it("adding fp-east to an existing tenant is immediately resolvable after invalidation", async () => {
    putRestaurant({
      id: "rest-fp-south",
      name: "FP South",
      slug: "fp-south",
      tenantId: "tenant-foodpark",
      isEnabled: true,
      tenant: { id: "tenant-foodpark", isEnabled: true },
    });

    const miss = await resolveTenantFromClassifiedHost(prodHost("fp-east.dvadtech.in"), lookup);
    assert.equal(miss.ok, false);

    putRestaurant({
      id: "rest-fp-east",
      name: "FP East",
      slug: "fp-east",
      tenantId: "tenant-foodpark",
      isEnabled: true,
      tenant: { id: "tenant-foodpark", isEnabled: true },
    });
    invalidateHostTenantCache("fp-east");

    const east = await resolveTenantFromClassifiedHost(prodHost("fp-east.dvadtech.in"), lookup);
    assert.equal(east.ok, true);
    if (east.ok && east.kind === "restaurant") {
      assert.equal(east.context.restaurantId, "rest-fp-east");
      assert.equal(east.context.tenantId, "tenant-foodpark");
    }

    const south = await resolveTenantFromClassifiedHost(prodHost("fp-south.dvadtech.in"), lookup);
    assert.equal(south.ok, true);
  });

  it("disabling a restaurant invalidates a cached successful resolution", async () => {
    putRestaurant({
      id: "rest-fp-south",
      name: "FP South",
      slug: "fp-south",
      tenantId: "tenant-foodpark",
      isEnabled: true,
      tenant: { id: "tenant-foodpark", isEnabled: true },
    });

    const live = await resolveTenantFromClassifiedHost(prodHost("fp-south.dvadtech.in"), lookup);
    assert.equal(live.ok, true);

    restaurants["fp-south"]!.isEnabled = false;
    const cachedLive = await resolveTenantFromClassifiedHost(prodHost("fp-south.dvadtech.in"), lookup);
    assert.equal(cachedLive.ok, true);

    invalidateHostTenantCache("fp-south");
    const revoked = await resolveTenantFromClassifiedHost(prodHost("fp-south.dvadtech.in"), lookup);
    assert.equal(revoked.ok, false);
    if (!revoked.ok) assert.equal(revoked.reason, "RESTAURANT_DISABLED");
  });

  it("disabling a tenant invalidates affected restaurant hostname resolution", async () => {
    putRestaurant({
      id: "rest-fp-south",
      name: "FP South",
      slug: "fp-south",
      tenantId: "tenant-foodpark",
      isEnabled: true,
      tenant: { id: "tenant-foodpark", isEnabled: true },
    });
    putRestaurant({
      id: "rest-fp-east",
      name: "FP East",
      slug: "fp-east",
      tenantId: "tenant-foodpark",
      isEnabled: true,
      tenant: { id: "tenant-foodpark", isEnabled: true },
    });

    assert.equal((await resolveTenantFromClassifiedHost(prodHost("fp-south.dvadtech.in"), lookup)).ok, true);
    assert.equal((await resolveTenantFromClassifiedHost(prodHost("fp-east.dvadtech.in"), lookup)).ok, true);

    restaurants["fp-south"]!.tenant = { id: "tenant-foodpark", isEnabled: false };
    restaurants["fp-east"]!.tenant = { id: "tenant-foodpark", isEnabled: false };
    restaurants["fp-south"]!.isEnabled = false;
    restaurants["fp-east"]!.isEnabled = false;
    invalidateHostTenantCacheForSlugs(["fp-south", "fp-east"]);

    const south = await resolveTenantFromClassifiedHost(prodHost("fp-south.dvadtech.in"), lookup);
    const east = await resolveTenantFromClassifiedHost(prodHost("fp-east.dvadtech.in"), lookup);
    assert.equal(south.ok, false);
    assert.equal(east.ok, false);
    if (!south.ok) assert.equal(south.reason, "RESTAURANT_DISABLED");
    if (!east.ok) assert.equal(east.reason, "RESTAURANT_DISABLED");
  });

  it("bare localhost development behavior remains unchanged", () => {
    const host = classifyHostname("localhost:3000", { nodeEnv: "development" });
    assert.equal(host.kind, "reserved");
    const restaurantLocal = classifyHostname("fp-south.localhost:3000", { nodeEnv: "development" });
    assert.equal(restaurantLocal.kind, "restaurant");
    if (restaurantLocal.kind === "restaurant") assert.equal(restaurantLocal.slug, "fp-south");
  });

  it("reserved and invalid restaurant slugs continue to fail", async () => {
    assert.ok(restaurantSlugValidationError("www"));
    assert.ok(restaurantSlugValidationError("platform"));
    assert.ok(restaurantSlugValidationError("Bad Slug"));
    await assert.rejects(
      () =>
        signupTenantWithRestaurant({
          tenantName: "Bad",
          billingEmail: "billing@example.com",
          restaurantName: "Bad",
          restaurantSlug: "www",
          ownerName: "Owner",
          ownerEmail: "owner@example.com",
          ownerPassword: "password12",
        }),
      /reserved/i,
    );
  });

  it("canonical restaurant URL uses TENANT_BASE_DOMAIN", () => {
    process.env.TENANT_BASE_DOMAIN = "dvadtech.in";
    process.env.APP_URL = "https://dvadtech.in";
    delete process.env.TENANT_PUBLIC_PROTOCOL;
    delete process.env.TENANT_PUBLIC_PORT;
    assert.equal(getRestaurantPublicBaseUrl("fp-south"), "https://fp-south.dvadtech.in");
  });
});

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  classifyHostname,
  denyMarketingOnOperationalHost,
  decidePlatformRouting,
  getOofBaseDomain,
  getPublicOperationalBaseDomain,
  isOofProductMarketingHost,
  isWwwCompanyHost,
} from "@/platform/host";
import {
  canonicalPlatformUiPath,
  isCanonicalPlatformUiPath,
  platformUiHref,
  rewritePlatformUiToInternal,
} from "@/platform/platform-paths";
import { getRestaurantPublicBaseUrl, getTableOrderUrl, getTenantHubPublicBaseUrl } from "@/lib/server-app-url";
import { previewHostnames, plannedRestaurantHostSlug } from "@/lib/hostname-rules";
import { assertProductionSecurityConfig } from "@/config/app-config";
import {
  clearHostTenantCache,
  resolveTenantFromClassifiedHost,
  type HostTenantLookup,
  type RestaurantHostRow,
} from "@/platform/host-tenant";
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

afterEach(() => {
  clearHostTenantCache();
  for (const key of Object.keys(restaurants)) delete restaurants[key];
  process.env.TENANT_BASE_DOMAIN = originalEnv.TENANT_BASE_DOMAIN;
  if (originalEnv.OOF_BASE_DOMAIN === undefined) delete process.env.OOF_BASE_DOMAIN;
  else process.env.OOF_BASE_DOMAIN = originalEnv.OOF_BASE_DOMAIN;
  process.env.APP_URL = originalEnv.APP_URL;
});

describe("OOF domain helpers", () => {
  it("derives oof.dvadtech.in from TENANT_BASE_DOMAIN when OOF_BASE_DOMAIN is unset", () => {
    process.env.TENANT_BASE_DOMAIN = "dvadtech.in";
    delete process.env.OOF_BASE_DOMAIN;
    assert.equal(getOofBaseDomain(), "oof.dvadtech.in");
    assert.equal(getPublicOperationalBaseDomain(), "oof.dvadtech.in");
  });

  it("honors explicit OOF_BASE_DOMAIN", () => {
    process.env.TENANT_BASE_DOMAIN = "dvadtech.in";
    process.env.OOF_BASE_DOMAIN = "oof.dvadtech.in";
    assert.equal(getOofBaseDomain(), "oof.dvadtech.in");
  });

  it("production OOF domain must sit under TENANT_BASE_DOMAIN", () => {
    const jwt = "production-jwt-secret-value-32chars-min";
    assert.doesNotThrow(() =>
      assertProductionSecurityConfig({
        NODE_ENV: "production",
        JWT_SECRET: jwt,
        TENANT_BASE_DOMAIN: "dvadtech.in",
      }),
    );
    assert.throws(
      () =>
        assertProductionSecurityConfig({
          NODE_ENV: "production",
          JWT_SECRET: jwt,
          TENANT_BASE_DOMAIN: "dvadtech.in",
          OOF_BASE_DOMAIN: "evil.example.com",
        }),
      /OOF_BASE_DOMAIN/,
    );
  });
});

describe("OOF host classification and marketing isolation", () => {
  const prod = { baseDomain: "dvadtech.in" as const, nodeEnv: "production" as const };

  it("classifies reserved company and product hosts", () => {
    assert.equal(classifyHostname("dvadtech.in", prod).kind, "reserved");
    assert.equal(classifyHostname("www.dvadtech.in", prod).kind, "reserved");
    const oof = classifyHostname("oof.dvadtech.in", prod);
    assert.equal(oof.kind, "reserved");
    assert.equal(isOofProductMarketingHost(oof, prod), true);
    assert.equal(isWwwCompanyHost(classifyHostname("www.dvadtech.in", prod), prod), true);
  });

  it("404s marketing paths on restaurant hosts", () => {
    const restaurant = classifyHostname("abc.oof.dvadtech.in", prod);
    assert.equal(denyMarketingOnOperationalHost("/oof", restaurant, prod), true);
    assert.equal(denyMarketingOnOperationalHost("/oof/platform", restaurant, prod), false);
    assert.equal(denyMarketingOnOperationalHost("/", restaurant, prod), false);
    const apex = classifyHostname("dvadtech.in", prod);
    assert.equal(denyMarketingOnOperationalHost("/oof", apex, prod), false);
  });
});

describe("canonical vs legacy host resolution", () => {
  it("resolves the same restaurant identity on both host forms", async () => {
    restaurants.abc = {
      id: "rest-abc",
      name: "ABC",
      slug: "abc",
      tenantId: "tenant-abc",
      isEnabled: true,
      tenant: { id: "tenant-abc", isEnabled: true },
    };
    const canonical = classifyHostname("abc.oof.dvadtech.in", {
      baseDomain: "dvadtech.in",
      nodeEnv: "production",
    });
    const legacy = classifyHostname("abc.dvadtech.in", {
      baseDomain: "dvadtech.in",
      nodeEnv: "production",
    });
    assert.equal(canonical.kind, "restaurant");
    assert.equal(legacy.kind, "restaurant");
    if (canonical.kind === "restaurant") assert.equal(canonical.slug, "abc");
    if (legacy.kind === "restaurant") assert.equal(legacy.slug, "abc");

    const a = await resolveTenantFromClassifiedHost(canonical, lookup);
    const b = await resolveTenantFromClassifiedHost(legacy, lookup);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    if (a.ok && a.kind === "restaurant" && b.ok && b.kind === "restaurant") {
      assert.equal(a.context.restaurantId, "rest-abc");
      assert.equal(b.context.restaurantId, a.context.restaurantId);
      assert.equal(a.context.tenantId, b.context.tenantId);
    }
  });

  it("unknown valid-form OOF restaurant is an opaque resolver 404", async () => {
    const host = classifyHostname("nobody.oof.dvadtech.in", {
      baseDomain: "dvadtech.in",
      nodeEnv: "production",
    });
    assert.equal(host.kind, "restaurant");
    const resolved = await resolveTenantFromClassifiedHost(host, lookup);
    assert.equal(resolved.ok, false);
    if (!resolved.ok) {
      assert.equal(resolved.status, 404);
      assert.equal(resolved.reason, "UNKNOWN_SUBDOMAIN");
    }
  });

  it("cross-restaurant isolation stays slug-bound", async () => {
    restaurants.abc = {
      id: "rest-abc",
      name: "ABC",
      slug: "abc",
      tenantId: "tenant-abc",
      isEnabled: true,
      tenant: { id: "tenant-abc", isEnabled: true },
    };
    restaurants.xyz = {
      id: "rest-xyz",
      name: "XYZ",
      slug: "xyz",
      tenantId: "tenant-xyz",
      isEnabled: true,
      tenant: { id: "tenant-xyz", isEnabled: true },
    };
    const abc = await resolveTenantFromClassifiedHost(
      classifyHostname("abc.oof.dvadtech.in", { baseDomain: "dvadtech.in", nodeEnv: "production" }),
      lookup,
    );
    const xyz = await resolveTenantFromClassifiedHost(
      classifyHostname("xyz.dvadtech.in", { baseDomain: "dvadtech.in", nodeEnv: "production" }),
      lookup,
    );
    assert.equal(abc.ok && abc.kind === "restaurant" && abc.context.restaurantId, "rest-abc");
    assert.equal(xyz.ok && xyz.kind === "restaurant" && xyz.context.restaurantId, "rest-xyz");
    if (abc.ok && abc.kind === "restaurant" && xyz.ok && xyz.kind === "restaurant") {
      assert.notEqual(abc.context.restaurantId, xyz.context.restaurantId);
    }
  });
});

describe("URL generation and QR", () => {
  it("generated restaurant, hub, and QR URLs use the OOF hostname", () => {
    process.env.TENANT_BASE_DOMAIN = "dvadtech.in";
    process.env.OOF_BASE_DOMAIN = "oof.dvadtech.in";
    process.env.APP_URL = "https://dvadtech.in";
    delete process.env.TENANT_PUBLIC_PROTOCOL;
    delete process.env.TENANT_PUBLIC_PORT;
    assert.equal(getRestaurantPublicBaseUrl("abc"), "https://abc.oof.dvadtech.in");
    assert.equal(getTenantHubPublicBaseUrl("x"), "https://x.oof.dvadtech.in");
    assert.equal(
      getTableOrderUrl("abc", "table-token-1"),
      "https://abc.oof.dvadtech.in/order/abc/table-token-1/check-in",
    );
    assert.match(getTableOrderUrl("abc", "table-token-1"), /\.oof\.dvadtech\.in\//);
  });

  it("1→2 hostname allocation still uses tenant-restaurant slugs on the OOF domain", () => {
    assert.equal(
      plannedRestaurantHostSlug({
        tenantSlug: "abc",
        tenantName: "ABC",
        restaurantName: "ABC",
        totalRestaurantCount: 2,
      }),
      "abc-abc",
    );
    const preview = previewHostnames({
      tenantName: "ABC",
      restaurantNames: ["ABC", "North"],
      baseDomain: "oof.dvadtech.in",
    });
    assert.equal(preview.tenantUrl, "https://abc.oof.dvadtech.in");
    assert.deepEqual(
      preview.restaurants.map((row) => row.url),
      ["https://abc-abc.oof.dvadtech.in", "https://abc-north.oof.dvadtech.in"],
    );
  });

  it("2→1 same-name mode collapses back to the tenant slug on the OOF domain", () => {
    const preview = previewHostnames({
      tenantName: "ABC",
      restaurantNames: ["ABC"],
      baseDomain: "oof.dvadtech.in",
    });
    assert.equal(preview.tenantHubActive, false);
    assert.equal(preview.restaurants[0].slug, "abc");
    assert.equal(preview.restaurants[0].url, "https://abc.oof.dvadtech.in");
  });
});

describe("PlatformAdmin canonical paths", () => {
  const opts = { nodeEnv: "production" as const, baseDomain: "dvadtech.in" };

  it("rewrites and redirects keep /oof/platform canonical", () => {
    assert.equal(platformUiHref("/login"), "/oof/platform/login");
    assert.equal(canonicalPlatformUiPath("/platform/tenants/x"), "/oof/platform/tenants/x");
    assert.equal(rewritePlatformUiToInternal("/oof/platform/login"), "/platform/login");
    assert.equal(isCanonicalPlatformUiPath("/oof/platform"), true);
    const apex = classifyHostname("dvadtech.in", { baseDomain: "dvadtech.in", nodeEnv: "production" });
    assert.equal(decidePlatformRouting("/oof/platform", apex, opts).kind, "allow");
    assert.equal(decidePlatformRouting("/platform", apex, opts).kind, "redirect");
    const restaurant = classifyHostname("abc.oof.dvadtech.in", {
      baseDomain: "dvadtech.in",
      nodeEnv: "production",
    });
    assert.equal(decidePlatformRouting("/oof/platform", restaurant, opts).kind, "deny");
  });
});

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  classifyHostname,
  getTrustedHostname,
  isValidRestaurantSubdomainSlug,
  restaurantSlugValidationError,
  sessionMatchesHostSlug,
  pathSlugMatchesHost,
  normalizeHostname,
  selectOwnedResource,
  trustedRestaurantId,
  allowsLegacyRestaurantScoping,
  blocksRestaurantOperationsOnHost,
  allowsApexPublicLanding,
  isConfiguredApexHost,
  platformRoutesAllowedOnHost,
  decidePlatformRouting,
  isPlatformPath,
} from "@/platform/host";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env.TENANT_BASE_DOMAIN = originalEnv.TENANT_BASE_DOMAIN;
  process.env.TRUST_FORWARDED_HOST = originalEnv.TRUST_FORWARDED_HOST;
  process.env.TENANT_RESERVED_HOSTS = originalEnv.TENANT_RESERVED_HOSTS;
  if (originalEnv.TENANT_APEX_RESTAURANT === undefined) delete process.env.TENANT_APEX_RESTAURANT;
  else process.env.TENANT_APEX_RESTAURANT = originalEnv.TENANT_APEX_RESTAURANT;
  if (originalEnv.APP_URL === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = originalEnv.APP_URL;
  if (originalEnv.NEXT_PUBLIC_APP_URL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalEnv.NEXT_PUBLIC_APP_URL;
});

describe("hostname normalization", () => {
  it("strips ports and lowercases", () => {
    assert.equal(normalizeHostname("ABC.dvadtech.in:443"), "abc.dvadtech.in");
    assert.equal(normalizeHostname("abc.localhost:3000"), "abc.localhost");
  });

  it("handles IPv6 brackets", () => {
    assert.equal(normalizeHostname("[::1]:3000"), "::1");
  });

  it("rejects comma-separated or empty hosts", () => {
    assert.equal(normalizeHostname("abc.dvadtech.in,evil.com"), "");
    assert.equal(normalizeHostname(""), "");
  });
});

describe("trusted hostname / forwarded host", () => {
  it("uses Host by default and ignores X-Forwarded-Host", () => {
    delete process.env.TRUST_FORWARDED_HOST;
    const headers = new Headers({
      host: "abc.dvadtech.in",
      "x-forwarded-host": "xyz.dvadtech.in",
    });
    assert.equal(getTrustedHostname(headers), "abc.dvadtech.in");
  });

  it("uses a single X-Forwarded-Host only when explicitly trusted", () => {
    process.env.TRUST_FORWARDED_HOST = "1";
    const headers = new Headers({
      host: "127.0.0.1:3000",
      "x-forwarded-host": "abc.dvadtech.in",
    });
    assert.equal(getTrustedHostname(headers), "abc.dvadtech.in");
  });

  it("rejects spoofed X-Forwarded-Host chains even when trusted", () => {
    process.env.TRUST_FORWARDED_HOST = "1";
    const headers = new Headers({
      host: "127.0.0.1:3000",
      "x-forwarded-host": "xyz.dvadtech.in, abc.dvadtech.in",
    });
    assert.equal(getTrustedHostname(headers), "127.0.0.1");
  });
});

describe("host classification", () => {
  it("maps restaurant subdomains on the configured base domain", () => {
    const host = classifyHostname("abc.dvadtech.in", { baseDomain: "dvadtech.in" });
    assert.equal(host.kind, "restaurant");
    if (host.kind === "restaurant") assert.equal(host.slug, "abc");
  });

  it("maps xyz.dvadtech.in to xyz", () => {
    const host = classifyHostname("xyz.dvadtech.in", { baseDomain: "dvadtech.in" });
    assert.equal(host.kind, "restaurant");
    if (host.kind === "restaurant") assert.equal(host.slug, "xyz");
  });

  it("treats apex, www, and platform as reserved", () => {
    assert.equal(classifyHostname("dvadtech.in", { baseDomain: "dvadtech.in" }).kind, "reserved");
    assert.equal(classifyHostname("www.dvadtech.in", { baseDomain: "dvadtech.in" }).kind, "reserved");
    assert.equal(classifyHostname("platform.dvadtech.in", { baseDomain: "dvadtech.in" }).kind, "reserved");
  });

  it("supports abc.localhost for local development", () => {
    const host = classifyHostname("abc.localhost:3000");
    assert.equal(host.kind, "restaurant");
    if (host.kind === "restaurant") assert.equal(host.slug, "abc");
  });

  it("treats bare localhost as reserved", () => {
    assert.equal(classifyHostname("localhost:3000").kind, "reserved");
    assert.equal(classifyHostname("127.0.0.1:3000").kind, "reserved");
  });

  it("fails closed for nested and unknown production hosts", () => {
    assert.equal(
      classifyHostname("foo.bar.dvadtech.in", { baseDomain: "dvadtech.in" }).kind,
      "invalid",
    );
    assert.equal(
      classifyHostname("evil.example.com", { baseDomain: "dvadtech.in", nodeEnv: "production" }).kind,
      "invalid",
    );
  });

  it("production without TENANT_BASE_DOMAIN is invalid, not reserved", () => {
    const host = classifyHostname("anything.example.com", { baseDomain: "", nodeEnv: "production" });
    assert.equal(host.kind, "invalid");
    if (host.kind === "invalid") assert.equal(host.reason, "missing_tenant_base_domain");
  });

  it("production raw IP is invalid", () => {
    const host = classifyHostname("198.51.100.10", { baseDomain: "dvadtech.in", nodeEnv: "production" });
    assert.equal(host.kind, "invalid");
  });

  it("configured apex may show a public landing without enabling restaurant ops", () => {
    delete process.env.TENANT_APEX_RESTAURANT;
    const apex = classifyHostname("dvadtech.in", { baseDomain: "dvadtech.in", nodeEnv: "production" });
    const www = classifyHostname("www.dvadtech.in", { baseDomain: "dvadtech.in", nodeEnv: "production" });
    const platform = classifyHostname("platform.dvadtech.in", {
      baseDomain: "dvadtech.in",
      nodeEnv: "production",
    });
    const unknown = classifyHostname("evil.example.net", {
      baseDomain: "dvadtech.in",
      nodeEnv: "production",
    });

    assert.equal(isConfiguredApexHost(apex, { baseDomain: "dvadtech.in" }), true);
    assert.equal(isConfiguredApexHost(www, { baseDomain: "dvadtech.in" }), true);
    assert.equal(isConfiguredApexHost(platform, { baseDomain: "dvadtech.in" }), false);
    assert.equal(allowsApexPublicLanding("/", apex, { baseDomain: "dvadtech.in" }), true);
    assert.equal(allowsApexPublicLanding("/staff/dashboard", apex, { baseDomain: "dvadtech.in" }), false);
    assert.equal(allowsApexPublicLanding("/", platform, { baseDomain: "dvadtech.in" }), false);
    assert.equal(allowsApexPublicLanding("/", unknown, { baseDomain: "dvadtech.in" }), false);
    assert.equal(blocksRestaurantOperationsOnHost(apex, "production"), true);
    assert.equal(allowsLegacyRestaurantScoping(apex, "production"), false);
  });

  it("TENANT_APEX_RESTAURANT=1 allows restaurant scoping only on the configured apex", () => {
    process.env.TENANT_APEX_RESTAURANT = "1";
    process.env.TENANT_BASE_DOMAIN = "dvadtech.in";
    const apex = classifyHostname("dvadtech.in", { baseDomain: "dvadtech.in", nodeEnv: "production" });
    const www = classifyHostname("www.dvadtech.in", { baseDomain: "dvadtech.in", nodeEnv: "production" });
    const platform = classifyHostname("platform.dvadtech.in", {
      baseDomain: "dvadtech.in",
      nodeEnv: "production",
    });
    const rawIp = classifyHostname("10.0.0.225", { baseDomain: "dvadtech.in", nodeEnv: "production" });
    const unknown = classifyHostname("dvadtech.duckdns.org", {
      baseDomain: "dvadtech.in",
      nodeEnv: "production",
    });

    assert.equal(allowsLegacyRestaurantScoping(apex, "production"), true);
    assert.equal(allowsLegacyRestaurantScoping(www, "production"), true);
    assert.equal(blocksRestaurantOperationsOnHost(apex, "production"), false);
    assert.equal(sessionMatchesHostSlug("fp-north", apex, "production"), true);
    assert.equal(allowsLegacyRestaurantScoping(platform, "production"), false);
    assert.equal(blocksRestaurantOperationsOnHost(platform, "production"), true);
    assert.equal(allowsLegacyRestaurantScoping(rawIp, "production"), false);
    assert.equal(blocksRestaurantOperationsOnHost(rawIp, "production"), true);
    assert.equal(allowsLegacyRestaurantScoping(unknown, "production"), false);
    assert.equal(blocksRestaurantOperationsOnHost(unknown, "production"), true);
  });

  it("APP_URL hostname is a public apex so the browser host is not a raw 404", () => {
    delete process.env.TENANT_APEX_RESTAURANT;
    process.env.TENANT_BASE_DOMAIN = "dvadtech.in";
    process.env.APP_URL = "https://dvadtech.duckdns.org";
    const duck = classifyHostname("dvadtech.duckdns.org", {
      baseDomain: "dvadtech.in",
      nodeEnv: "production",
    });
    const evil = classifyHostname("evil.example.net", {
      baseDomain: "dvadtech.in",
      nodeEnv: "production",
    });
    const rawIp = classifyHostname("10.0.0.225", { baseDomain: "dvadtech.in", nodeEnv: "production" });

    assert.equal(duck.kind, "reserved");
    assert.equal(isConfiguredApexHost(duck, { baseDomain: "dvadtech.in" }), true);
    assert.equal(allowsApexPublicLanding("/", duck, { baseDomain: "dvadtech.in" }), true);
    assert.equal(blocksRestaurantOperationsOnHost(duck, "production"), true);
    assert.equal(allowsLegacyRestaurantScoping(duck, "production"), false);
    assert.equal(evil.kind, "invalid");
    assert.equal(allowsApexPublicLanding("/", evil, { baseDomain: "dvadtech.in" }), false);
    assert.equal(rawIp.kind, "invalid");

    process.env.TENANT_APEX_RESTAURANT = "1";
    assert.equal(allowsLegacyRestaurantScoping(duck, "production"), true);
    assert.equal(blocksRestaurantOperationsOnHost(duck, "production"), false);
    assert.equal(allowsLegacyRestaurantScoping(evil, "production"), false);
    assert.equal(allowsLegacyRestaurantScoping(rawIp, "production"), false);
  });
});

describe("platform host restriction", () => {
  const prod = { baseDomain: "dvadtech.in" as const, nodeEnv: "production" as const };
  const routeOpts = { nodeEnv: "production" as const, baseDomain: "dvadtech.in" };

  it("treats /platform and /api/platform as platform paths", () => {
    assert.equal(isPlatformPath("/platform"), true);
    assert.equal(isPlatformPath("/platform/login"), true);
    assert.equal(isPlatformPath("/platform/tenants"), true);
    assert.equal(isPlatformPath("/api/platform/tenants"), true);
    assert.equal(isPlatformPath("/api/platform/auth/login"), true);
    assert.equal(isPlatformPath("/"), false);
    assert.equal(isPlatformPath("/api/health"), false);
    assert.equal(isPlatformPath("/tenant/signup"), false);
    assert.equal(isPlatformPath("/api/jobs/process"), false);
  });

  it("production apex / redirects to /platform and allows platform routes", () => {
    process.env.TENANT_BASE_DOMAIN = "dvadtech.in";
    const apex = classifyHostname("dvadtech.in", prod);
    assert.equal(platformRoutesAllowedOnHost(apex, "production", routeOpts), true);
    assert.deepEqual(decidePlatformRouting("/", apex, { ...routeOpts, method: "GET" }), {
      kind: "redirect",
      location: "/platform",
    });
    assert.equal(decidePlatformRouting("/platform", apex, routeOpts).kind, "allow");
    assert.equal(decidePlatformRouting("/platform/login", apex, routeOpts).kind, "allow");
    assert.equal(decidePlatformRouting("/api/platform/tenants", apex, routeOpts).kind, "allow");
    assert.equal(decidePlatformRouting("/api/platform/auth/login", apex, routeOpts).kind, "allow");
  });

  it("restaurant hosts deny /platform and /api/platform even if a platform cookie exists", () => {
    process.env.TENANT_BASE_DOMAIN = "dvadtech.in";
    const restaurant = classifyHostname("fp-north.dvadtech.in", prod);
    assert.equal(restaurant.kind, "restaurant");
    assert.equal(platformRoutesAllowedOnHost(restaurant, "production", routeOpts), false);
    assert.equal(decidePlatformRouting("/", restaurant, routeOpts).kind, "pass");
    for (const path of [
      "/platform",
      "/platform/login",
      "/platform/tenants",
      "/api/platform/tenants",
      "/api/platform/auth/login",
    ]) {
      assert.equal(decidePlatformRouting(path, restaurant, routeOpts).kind, "deny");
    }
  });

  it("does not expose platform on www or platform.*", () => {
    process.env.TENANT_BASE_DOMAIN = "dvadtech.in";
    const www = classifyHostname("www.dvadtech.in", prod);
    const platformHost = classifyHostname("platform.dvadtech.in", prod);
    assert.equal(decidePlatformRouting("/platform", www, routeOpts).kind, "deny");
    assert.equal(decidePlatformRouting("/api/platform/tenants", platformHost, routeOpts).kind, "deny");
    assert.equal(decidePlatformRouting("/", www, routeOpts).kind, "pass");
  });

  it("unknown production hosts stay fail-closed for platform paths", () => {
    const unknown = classifyHostname("unknown.dvadtech.in", prod);
    const rawIp = classifyHostname("10.0.0.225", prod);
    assert.equal(decidePlatformRouting("/platform", unknown, routeOpts).kind, "deny");
    assert.equal(decidePlatformRouting("/api/platform/tenants", rawIp, routeOpts).kind, "deny");
  });

  it("bare localhost keeps platform development; restaurant localhost does not", () => {
    const local = classifyHostname("localhost:3000", { nodeEnv: "development" });
    const restaurantLocal = classifyHostname("fp-north.localhost:3000", { nodeEnv: "development" });
    const opts = { nodeEnv: "development" as const };
    assert.equal(platformRoutesAllowedOnHost(local, "development"), true);
    assert.equal(decidePlatformRouting("/platform", local, opts).kind, "allow");
    assert.equal(decidePlatformRouting("/api/platform/tenants", local, opts).kind, "allow");
    assert.equal(decidePlatformRouting("/", local, opts).kind, "pass");
    assert.equal(platformRoutesAllowedOnHost(restaurantLocal, "development"), false);
    assert.equal(decidePlatformRouting("/platform", restaurantLocal, opts).kind, "deny");
    assert.equal(decidePlatformRouting("/platform/login", restaurantLocal, opts).kind, "deny");
    assert.equal(decidePlatformRouting("/", restaurantLocal, opts).kind, "pass");
  });
});

describe("slug validation", () => {
  it("accepts DNS-safe restaurant slugs", () => {
    assert.equal(isValidRestaurantSubdomainSlug("abc"), true);
    assert.equal(isValidRestaurantSubdomainSlug("restaurant-name"), true);
    assert.equal(isValidRestaurantSubdomainSlug("pistahouse-dt"), true);
  });

  it("rejects reserved and malformed slugs", () => {
    assert.equal(isValidRestaurantSubdomainSlug("www"), false);
    assert.equal(isValidRestaurantSubdomainSlug("Platform"), false);
    assert.ok(restaurantSlugValidationError("Bad Slug"));
    assert.ok(restaurantSlugValidationError("-abc"));
  });
});

describe("session and path binding", () => {
  const abc = classifyHostname("abc.dvadtech.in", { baseDomain: "dvadtech.in" });
  const xyz = classifyHostname("xyz.dvadtech.in", { baseDomain: "dvadtech.in" });

  it("allows matching staff session and rejects cross-host JWT", () => {
    assert.equal(sessionMatchesHostSlug("abc", abc), true);
    assert.equal(sessionMatchesHostSlug("abc", xyz), false);
    assert.equal(sessionMatchesHostSlug("xyz", xyz), true);
    assert.equal(sessionMatchesHostSlug("xyz", abc), false);
  });

  it("requires path slug to match restaurant host", () => {
    assert.equal(pathSlugMatchesHost("abc", abc), true);
    assert.equal(pathSlugMatchesHost("xyz", abc), false);
  });
});

describe("resource ownership", () => {
  it("hides cross-tenant rows on a restaurant host", () => {
    assert.equal(selectOwnedResource("rest-abc", { restaurantId: "rest-abc" })?.restaurantId, "rest-abc");
    assert.equal(selectOwnedResource("rest-abc", { restaurantId: "rest-xyz" }), null);
  });

  it("ignores injected restaurantId on a restaurant host", () => {
    assert.equal(trustedRestaurantId("rest-abc", "rest-xyz"), "rest-abc");
    assert.equal(trustedRestaurantId(null, "rest-xyz"), "rest-xyz");
  });
});

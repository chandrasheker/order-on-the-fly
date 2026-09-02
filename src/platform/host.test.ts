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
} from "@/platform/host";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env.TENANT_BASE_DOMAIN = originalEnv.TENANT_BASE_DOMAIN;
  process.env.TRUST_FORWARDED_HOST = originalEnv.TRUST_FORWARDED_HOST;
  process.env.TENANT_RESERVED_HOSTS = originalEnv.TENANT_RESERVED_HOSTS;
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

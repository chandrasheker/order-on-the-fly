import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  assertUniqueRestaurantNames,
  canonicalizeName,
  hostnameInUseError,
  isSameEntityName,
  isSingleSameNameRestaurantMode,
  plannedRestaurantHostSlug,
  previewHostnames,
  restaurantHostnameChangedNotice,
  tenantHubIsActive,
  tenantSlugFromName,
} from "@/lib/hostname-rules";

describe("name uniqueness rules", () => {
  it("treats tenant names as equal case-insensitively", () => {
    assert.equal(canonicalizeName("ABC"), "abc");
    assert.equal(canonicalizeName(" Abc  "), "abc");
    assert.ok(isSameEntityName("ABC", "abc"));
    assert.ok(isSameEntityName("ABC", "Abc"));
  });

  it("rejects duplicate restaurant names in one tenant", () => {
    assert.throws(() => assertUniqueRestaurantNames(["South", "SOUTH"]), /already used/i);
  });

  it("allows the same restaurant name across different tenants via preview isolation", () => {
    const abc = previewHostnames({ tenantName: "ABC", restaurantNames: ["South"], baseDomain: "dvadtech.in" });
    const xyz = previewHostnames({ tenantName: "XYZ", restaurantNames: ["South"], baseDomain: "dvadtech.in" });
    assert.equal(abc.restaurants[0].slug, "abc-south");
    assert.equal(xyz.restaurants[0].slug, "xyz-south");
  });

  it("allows a multi-restaurant tenant to reuse the tenant name for one restaurant", () => {
    const preview = previewHostnames({
      tenantName: "ABC",
      restaurantNames: ["ABC", "North"],
      baseDomain: "dvadtech.in",
    });
    assert.equal(preview.tenantHubActive, true);
    assert.equal(preview.tenantUrl, "https://abc.dvadtech.in");
    assert.deepEqual(
      preview.restaurants.map((restaurant) => restaurant.slug),
      ["abc-abc", "abc-north"],
    );
  });
});

describe("hostname generation", () => {
  it("single same-name tenant/restaurant uses the tenant slug", () => {
    assert.equal(
      plannedRestaurantHostSlug({
        tenantSlug: "abc",
        tenantName: "ABC",
        restaurantName: "ABC",
        totalRestaurantCount: 1,
      }),
      "abc",
    );
    const preview = previewHostnames({
      tenantName: "ABC",
      restaurantNames: ["ABC"],
      baseDomain: "dvadtech.in",
    });
    assert.equal(preview.tenantSlug, "abc");
    assert.equal(preview.tenantHubActive, false);
    assert.equal(preview.tenantUrl, null);
    assert.equal(preview.restaurants[0].url, "https://abc.dvadtech.in");
  });

  it("single different-name restaurant uses tenant-restaurant slug and no hub", () => {
    const preview = previewHostnames({
      tenantName: "ABC",
      restaurantNames: ["South"],
      baseDomain: "dvadtech.in",
    });
    assert.equal(preview.restaurants[0].slug, "abc-south");
    assert.equal(preview.restaurants[0].url, "https://abc-south.dvadtech.in");
    assert.equal(preview.tenantHubActive, false);
    assert.equal(preview.tenantUrl, null);
  });

  it("multiple restaurants allocate tenant hub plus prefixed restaurant hosts", () => {
    const preview = previewHostnames({
      tenantName: "ABC",
      restaurantNames: ["South", "North"],
      baseDomain: "dvadtech.in",
    });
    assert.equal(preview.tenantSlug, "abc");
    assert.equal(preview.tenantHubActive, true);
    assert.deepEqual(
      preview.restaurants.map((restaurant) => restaurant.slug),
      ["abc-south", "abc-north"],
    );
  });

  it("slugifies spaced names", () => {
    assert.equal(tenantSlugFromName("ABC Foods"), "abc-foods");
    assert.equal(
      plannedRestaurantHostSlug({
        tenantSlug: "abc",
        tenantName: "ABC",
        restaurantName: "South Branch",
        totalRestaurantCount: 2,
      }),
      "abc-south-branch",
    );
  });

  it("reserved tenant names are rejected", () => {
    assert.throws(() => tenantSlugFromName("www"), /reserved/i);
    assert.throws(() => tenantSlugFromName("platform"), /reserved/i);
  });

  it("formats hostname-in-use errors", () => {
    assert.equal(
      hostnameInUseError("abc-south", "dvadtech.in"),
      "The hostname abc-south.dvadtech.in is already in use.",
    );
  });

  it("single same-name mode ends after a restaurant rename but hub stays inactive at count 1", () => {
    assert.ok(
      isSingleSameNameRestaurantMode({
        tenantSlug: "abc",
        tenantName: "ABC",
        restaurants: [{ name: "ABC", slug: "abc" }],
      }),
    );
    assert.equal(
      tenantHubIsActive({
        tenantSlug: "abc",
        tenantName: "ABC",
        restaurants: [{ name: "North", slug: "abc-north" }],
      }),
      false,
    );
    assert.equal(
      restaurantHostnameChangedNotice("abc-abc.dvadtech.in"),
      "Restaurant hostname changed to abc-abc.dvadtech.in. Reprint/reissue QR codes that contain the old hostname.",
    );
  });
});

describe("PostgreSQL nameNormalized parity", () => {
  it("schema and M7 migration include Tenant/Restaurant normalized-name uniqueness", () => {
    const schema = fs.readFileSync(path.join(process.cwd(), "prisma/schema.postgres.prisma"), "utf8");
    assert.match(schema, /model Tenant[\s\S]*nameNormalized\s+String\s+@unique @default\(""\)/);
    assert.match(schema, /model Restaurant[\s\S]*nameNormalized\s+String\s+@default\(""\)/);
    assert.match(schema, /@@unique\(\[tenantId, nameNormalized\]\)/);
    const sql = fs.readFileSync(
      path.join(process.cwd(), "prisma/migrations-postgres/000022_m7_name_normalized/migration.sql"),
      "utf8",
    );
    assert.match(sql, /ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "nameNormalized"/);
    assert.match(sql, /ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "nameNormalized"/);
    assert.match(sql, /regexp_replace\("name", '\\s\+', ' ', 'g'\)/);
    assert.match(sql, /Tenant_nameNormalized_key/);
    assert.match(sql, /Restaurant_tenantId_nameNormalized_key/);
    execFileSync(
      process.execPath,
      [path.join(process.cwd(), "scripts", "run-with-mem.js"), "npx", "prisma", "validate", "--schema", "prisma/schema.postgres.prisma"],
      { cwd: process.cwd(), stdio: "inherit" },
    );
  });
});

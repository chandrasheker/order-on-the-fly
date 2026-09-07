import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  classifyHostname,
  decidePlatformRouting,
} from "@/platform/host";
import {
  clearHostTenantCache,
  HostTenantError,
  invalidateHostTenantCache,
  requireTenantContext,
  resolveTenantFromClassifiedHost,
} from "@/platform/host-tenant";

const dbPath = path.join(os.tmpdir(), `tabletap-hub-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_URL = `file:${dbPath}`;

let prisma: PrismaClient;
let signupTenantWithRestaurants: typeof import("@/lib/tenant-onboarding-service").signupTenantWithRestaurants;
let addRestaurantToTenant: typeof import("@/lib/tenant-onboarding-service").addRestaurantToTenant;
let renameRestaurant: typeof import("@/lib/tenant-onboarding-service").renameRestaurant;
let getTenantOverview: typeof import("@/lib/tenant-onboarding-service").getTenantOverview;
let deleteRestaurantEverywhere: typeof import("@/lib/tenant-lifecycle").deleteRestaurantEverywhere;
let resolveTenantAdminHostContext: typeof import("@/lib/tenant-admin-host").resolveTenantAdminHostContext;
let removeObsoleteSingleRestaurantTenantHubs: typeof import("@/lib/hostname-allocation").removeObsoleteSingleRestaurantTenantHubs;
let assertPathSlugForResolution: typeof import("@/platform/tenant-scope").assertPathSlugForResolution;

const suffix = `${Date.now()}`;

before(async () => {
  execFileSync(
    process.execPath,
    [
      path.join(process.cwd(), "scripts", "run-with-mem.js"),
      "npx",
      "prisma",
      "db",
      "push",
      "--url",
      `file:${dbPath}`,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
      stdio: "inherit",
    },
  );
  ({ prisma } = await import("@/lib/prisma"));
  ({
    signupTenantWithRestaurants,
    addRestaurantToTenant,
    renameRestaurant,
    getTenantOverview,
  } = await import("@/lib/tenant-onboarding-service"));
  ({ deleteRestaurantEverywhere } = await import("@/lib/tenant-lifecycle"));
  ({ resolveTenantAdminHostContext } = await import("@/lib/tenant-admin-host"));
  ({ removeObsoleteSingleRestaurantTenantHubs } = await import("@/lib/hostname-allocation"));
  ({ assertPathSlugForResolution } = await import("@/platform/tenant-scope"));
});

after(async () => {
  if (prisma) await prisma.$disconnect().catch(() => undefined);
  for (const extra of ["", "-wal", "-shm", "-journal"]) {
    fs.rmSync(`${dbPath}${extra}`, { force: true });
  }
});

function prod(slug: string) {
  return classifyHostname(`${slug}.dvadtech.in`, { baseDomain: "dvadtech.in", nodeEnv: "production" });
}

describe("tenant hub onboarding and resolution", () => {
  it("creates ABC/ABC as restaurant host abc, not a tenant hub", async () => {
    const created = await signupTenantWithRestaurants({
      tenantName: `ABC${suffix}`,
      billingEmail: `billing-abc${suffix}@example.com`,
      restaurants: [
        {
          name: `ABC${suffix}`,
          ownerEmail: `owner-abc${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
      ],
    });
    const slug = created.restaurants[0].restaurant.slug;
    assert.equal(slug, created.tenant.slug);
    const lease = await prisma.hostSlug.findUnique({ where: { slug } });
    assert.equal(lease?.kind, "restaurant");
    clearHostTenantCache();
    const resolved = await resolveTenantFromClassifiedHost(prod(slug));
    assert.equal(resolved.ok, true);
    if (resolved.ok) assert.equal(resolved.kind, "restaurant");
  });

  it("creates ABC/South as abc-south and does not steal abc for another restaurant", async () => {
    const created = await signupTenantWithRestaurants({
      tenantName: `Group${suffix}`,
      billingEmail: `billing-group${suffix}@example.com`,
      restaurants: [
        {
          name: "South",
          ownerEmail: `owner-group${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
      ],
    });
    assert.equal(created.restaurants[0].restaurant.slug, `${created.tenant.slug}-south`);
    const hub = await prisma.hostSlug.findUnique({ where: { slug: created.tenant.slug } });
    assert.equal(hub, null);
    clearHostTenantCache();
    const restaurant = await resolveTenantFromClassifiedHost(prod(created.restaurants[0].restaurant.slug));
    const tenant = await resolveTenantFromClassifiedHost(prod(created.tenant.slug));
    assert.equal(restaurant.ok && restaurant.kind, "restaurant");
    assert.equal(tenant.ok, false);
  });

  it("creates multi-restaurant ABC South/North hosts and a tenant hub", async () => {
    const created = await signupTenantWithRestaurants({
      tenantName: `Multi${suffix}`,
      billingEmail: `billing-multi${suffix}@example.com`,
      restaurants: [
        {
          name: "South",
          ownerEmail: `owner-multi-s${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
        {
          name: "North",
          ownerEmail: `owner-multi-n${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
      ],
    });
    const slugs = created.restaurants.map((row) => row.restaurant.slug).sort();
    assert.deepEqual(slugs, [`${created.tenant.slug}-north`, `${created.tenant.slug}-south`]);
    clearHostTenantCache();
    const hub = await resolveTenantFromClassifiedHost(prod(created.tenant.slug));
    assert.equal(hub.ok && hub.kind, "tenant");
  });

  it("creates a same-name multi-restaurant tenant as hub plus prefixed restaurant hosts", async () => {
    const created = await signupTenantWithRestaurants({
      tenantName: `Clash${suffix}`,
      billingEmail: `billing-clash${suffix}@example.com`,
      restaurants: [
        {
          name: `Clash${suffix}`,
          ownerEmail: `owner-clash-a${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
        {
          name: "North",
          ownerEmail: `owner-clash-b${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
      ],
    });
    const sameName = created.restaurants.find((row) => row.restaurant.name === `Clash${suffix}`);
    const north = created.restaurants.find((row) => row.restaurant.name === "North");
    assert.equal(sameName?.restaurant.slug, `${created.tenant.slug}-${created.tenant.slug}`);
    assert.equal(north?.restaurant.slug, `${created.tenant.slug}-north`);
    const hub = await prisma.hostSlug.findUnique({ where: { slug: created.tenant.slug } });
    assert.equal(hub?.kind, "tenant_hub");
  });

  it("moves a same-name restaurant onto a prefixed host when a second restaurant is added", async () => {
    const created = await signupTenantWithRestaurants({
      tenantName: `Solo${suffix}`,
      billingEmail: `billing-solo${suffix}@example.com`,
      restaurants: [
        {
          name: `Solo${suffix}`,
          ownerEmail: `owner-solo${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
      ],
    });
    assert.equal(created.restaurants[0].restaurant.slug, created.tenant.slug);

    const added = await addRestaurantToTenant(created.tenant.id, {
      name: "South",
      ownerEmail: `owner-solo-south${suffix}@example.com`,
      ownerName: "Owner",
      ownerPassword: "password12",
    });
    assert.equal(added.restaurant.slug, `${created.tenant.slug}-south`);
    assert.ok(
      added.notices.some((notice) =>
        notice.includes(`Restaurant hostname changed to ${created.tenant.slug}-${created.tenant.slug}.dvadtech.in`),
      ),
    );
    const original = await prisma.restaurant.findUnique({ where: { id: created.restaurants[0].restaurant.id } });
    assert.equal(original?.slug, `${created.tenant.slug}-${created.tenant.slug}`);
    clearHostTenantCache();
    const hub = await resolveTenantFromClassifiedHost(prod(created.tenant.slug));
    const renamed = await resolveTenantFromClassifiedHost(prod(`${created.tenant.slug}-${created.tenant.slug}`));
    const south = await resolveTenantFromClassifiedHost(prod(`${created.tenant.slug}-south`));
    assert.equal(hub.ok && hub.kind, "tenant");
    assert.equal(renamed.ok && renamed.kind, "restaurant");
    assert.equal(south.ok && south.kind, "restaurant");
    const leases = await prisma.hostSlug.findMany({ where: { tenantId: created.tenant.id } });
    assert.equal(leases.filter((lease) => lease.kind === "tenant_hub").length, 1);
    assert.equal(leases.filter((lease) => lease.kind === "restaurant").length, 2);
  });

  it("rejects a tenant hostname that collides with another restaurant hostname", async () => {
    const first = await signupTenantWithRestaurants({
      tenantName: `Hold${suffix}`,
      billingEmail: `billing-hold${suffix}@example.com`,
      restaurants: [
        {
          name: `Hold${suffix}`,
          ownerEmail: `owner-hold${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
      ],
    });
    await assert.rejects(
      () =>
        signupTenantWithRestaurants({
          tenantName: first.tenant.slug,
          billingEmail: `billing-steal${suffix}@example.com`,
          restaurants: [
            {
              name: "Other",
              ownerEmail: `owner-steal${suffix}@example.com`,
              ownerName: "Owner",
              ownerPassword: "password12",
            },
          ],
        }),
      /already in use/i,
    );
  });

  it("keeps platform routes apex-only", () => {
    const apex = classifyHostname("dvadtech.in", { baseDomain: "dvadtech.in", nodeEnv: "production" });
    const hub = classifyHostname("abc.dvadtech.in", { baseDomain: "dvadtech.in", nodeEnv: "production" });
    const restaurant = classifyHostname("abc-south.dvadtech.in", {
      baseDomain: "dvadtech.in",
      nodeEnv: "production",
    });
    const opts = { nodeEnv: "production", baseDomain: "dvadtech.in" };
    assert.equal(decidePlatformRouting("/platform", apex, opts).kind, "allow");
    assert.equal(decidePlatformRouting("/platform", hub, opts).kind, "deny");
    assert.equal(decidePlatformRouting("/api/platform/tenants", restaurant, opts).kind, "deny");
  });

  it("invalidates cached unknown slugs after create", async () => {
    const host = prod(`fresh${suffix}`);
    clearHostTenantCache();
    const miss = await resolveTenantFromClassifiedHost(host);
    assert.equal(miss.ok, false);
    await signupTenantWithRestaurants({
      tenantName: `Fresh${suffix}`,
      billingEmail: `billing-fresh${suffix}@example.com`,
      restaurants: [
        {
          name: `Fresh${suffix}`,
          ownerEmail: `owner-fresh${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
      ],
    });
    invalidateHostTenantCache(`fresh${suffix}`);
    const hit = await resolveTenantFromClassifiedHost(host);
    assert.equal(hit.ok, true);
    if (hit.ok) assert.equal(hit.kind, "restaurant");
  });

  it("stores an explicit tenant admin and does not make every restaurant owner a tenant admin", async () => {
    const created = await signupTenantWithRestaurants({
      tenantName: `Admins${suffix}`,
      billingEmail: `billing-admins${suffix}@example.com`,
      restaurants: [
        {
          name: "South",
          ownerEmail: `owner-admins-s${suffix}@example.com`,
          ownerName: "South Owner",
          ownerPassword: "password12",
        },
        {
          name: "North",
          ownerEmail: `owner-admins-n${suffix}@example.com`,
          ownerName: "North Owner",
          ownerPassword: "password12",
        },
      ],
    });
    const admins = await prisma.tenantAdmin.findMany({ where: { tenantId: created.tenant.id } });
    assert.equal(admins.length, 1);
    assert.equal(admins[0].email, `owner-admins-s${suffix}@example.com`);
    const northOwner = await prisma.user.findUnique({
      where: { email: `owner-admins-n${suffix}@example.com` },
    });
    assert.ok(northOwner);
    assert.equal(northOwner.role, "OWNER");
  });

  it("rejects a second tenant with the same canonical name", async () => {
    await signupTenantWithRestaurants({
      tenantName: `Unique Name ${suffix}`,
      billingEmail: `billing-unique${suffix}@example.com`,
      restaurants: [
        {
          name: "South",
          ownerEmail: `owner-unique${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
      ],
    });
    await assert.rejects(
      () =>
        signupTenantWithRestaurants({
          tenantName: `unique name ${suffix}`,
          billingEmail: `billing-unique2${suffix}@example.com`,
          restaurants: [
            {
              name: "North",
              ownerEmail: `owner-unique2${suffix}@example.com`,
              ownerName: "Owner",
              ownerPassword: "password12",
            },
          ],
        }),
      /already in use/i,
    );
  });

  it("rejects duplicate restaurant names within one tenant case-insensitively", async () => {
    const created = await signupTenantWithRestaurants({
      tenantName: `DupRest${suffix}`,
      billingEmail: `billing-duprest${suffix}@example.com`,
      restaurants: [
        {
          name: "South",
          ownerEmail: `owner-duprest${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
      ],
    });
    await assert.rejects(
      () =>
        addRestaurantToTenant(created.tenant.id, {
          name: "SOUTH",
          ownerEmail: `owner-duprest-2${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        }),
      /already used/i,
    );
  });

  it("allows the same restaurant name across different tenants", async () => {
    const first = await signupTenantWithRestaurants({
      tenantName: `Alpha${suffix}`,
      billingEmail: `billing-alpha${suffix}@example.com`,
      restaurants: [
        {
          name: "South",
          ownerEmail: `owner-alpha${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
      ],
    });
    const second = await signupTenantWithRestaurants({
      tenantName: `Beta${suffix}`,
      billingEmail: `billing-beta${suffix}@example.com`,
      restaurants: [
        {
          name: "South",
          ownerEmail: `owner-beta${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
      ],
    });
    assert.equal(first.restaurants[0].restaurant.name, "South");
    assert.equal(second.restaurants[0].restaurant.name, "South");
    assert.equal(first.restaurants[0].restaurant.slug, `${first.tenant.slug}-south`);
    assert.equal(second.restaurants[0].restaurant.slug, `${second.tenant.slug}-south`);
  });

  it("rejects a restaurant hostname that collides with another tenant hostname", async () => {
    const first = await signupTenantWithRestaurants({
      tenantName: `HubHold${suffix}`,
      billingEmail: `billing-hubhold${suffix}@example.com`,
      restaurants: [
        {
          name: "South",
          ownerEmail: `owner-hubhold${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
      ],
    });
    await assert.rejects(
      () =>
        signupTenantWithRestaurants({
          tenantName: first.restaurants[0].restaurant.slug,
          billingEmail: `billing-collide-hub${suffix}@example.com`,
          restaurants: [
            {
              name: "Other",
              ownerEmail: `owner-collide-hub${suffix}@example.com`,
              ownerName: "Owner",
              ownerPassword: "password12",
            },
          ],
        }),
      /already in use/i,
    );
  });

  it("rejects reserved tenant hostnames", async () => {
    await assert.rejects(
      () =>
        signupTenantWithRestaurants({
          tenantName: "www",
          billingEmail: `billing-www${suffix}@example.com`,
          restaurants: [
            {
              name: "South",
              ownerEmail: `owner-www${suffix}@example.com`,
              ownerName: "Owner",
              ownerPassword: "password12",
            },
          ],
        }),
      /reserved/i,
    );
  });

  it("keeps tenant overview scoped to that tenant", async () => {
    const abc = await signupTenantWithRestaurants({
      tenantName: `ScopeA${suffix}`,
      billingEmail: `billing-scopea${suffix}@example.com`,
      restaurants: [
        {
          name: "South",
          ownerEmail: `owner-scopea${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
      ],
    });
    const xyz = await signupTenantWithRestaurants({
      tenantName: `ScopeZ${suffix}`,
      billingEmail: `billing-scopez${suffix}@example.com`,
      restaurants: [
        {
          name: "South",
          ownerEmail: `owner-scopez${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
      ],
    });
    const overview = await getTenantOverview(abc.tenant.id);
    assert.ok(overview);
    assert.equal(overview.tenant.id, abc.tenant.id);
    assert.ok(overview.restaurants.every((restaurant) => restaurant.id !== xyz.restaurants[0].restaurant.id));
    assert.equal(
      overview.restaurants.some((restaurant) => restaurant.id === abc.restaurants[0].restaurant.id),
      true,
    );
  });

  it("does not treat a tenant hub as a restaurant host for operations", async () => {
    const created = await signupTenantWithRestaurants({
      tenantName: `HubOps${suffix}`,
      billingEmail: `billing-hubops${suffix}@example.com`,
      restaurants: [
        {
          name: "South",
          ownerEmail: `owner-hubops${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
        {
          name: "North",
          ownerEmail: `owner-hubops-n${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
      ],
    });
    const headers = new Headers({ host: `${created.tenant.slug}.dvadtech.in` });
    process.env.TENANT_BASE_DOMAIN = "dvadtech.in";
    await assert.rejects(() => requireTenantContext(headers), HostTenantError);
    const resolved = await resolveTenantFromClassifiedHost(prod(created.tenant.slug));
    assert.equal(assertPathSlugForResolution(created.tenant.slug, resolved), false);
    delete process.env.TENANT_BASE_DOMAIN;
  });

  it("invalidates host cache on single-to-multi rename without a full cache clear", async () => {
    const created = await signupTenantWithRestaurants({
      tenantName: `CacheSolo${suffix}`,
      billingEmail: `billing-cachesolo${suffix}@example.com`,
      restaurants: [
        {
          name: `CacheSolo${suffix}`,
          ownerEmail: `owner-cachesolo${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
      ],
    });
    const tenantSlug = created.tenant.slug;
    clearHostTenantCache();
    const before = await resolveTenantFromClassifiedHost(prod(tenantSlug));
    assert.equal(before.ok && before.kind, "restaurant");

    await renameRestaurant(created.restaurants[0].restaurant.id, "North");
    const leftover = await resolveTenantFromClassifiedHost(prod(tenantSlug));
    const north = await resolveTenantFromClassifiedHost(prod(`${tenantSlug}-north`));
    assert.equal(leftover.ok, false);
    assert.equal(north.ok && north.kind, "restaurant");
    const leftoverLease = await prisma.hostSlug.findUnique({ where: { slug: tenantSlug } });
    assert.equal(leftoverLease, null);
  });

  it("does not rewrite sibling restaurant hostnames when one restaurant is renamed", async () => {
    const created = await signupTenantWithRestaurants({
      tenantName: `Siblings${suffix}`,
      billingEmail: `billing-siblings${suffix}@example.com`,
      restaurants: [
        {
          name: "South",
          ownerEmail: `owner-siblings-s${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
        {
          name: "North",
          ownerEmail: `owner-siblings-n${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
      ],
    });
    const south = created.restaurants.find((row) => row.restaurant.name === "South");
    const north = created.restaurants.find((row) => row.restaurant.name === "North");
    assert.ok(south && north);
    const northSlug = north.restaurant.slug;
    await renameRestaurant(south.restaurant.id, "East");
    const northAfter = await prisma.restaurant.findUnique({ where: { id: north.restaurant.id } });
    assert.equal(northAfter?.slug, northSlug);
    const east = await prisma.restaurant.findUnique({ where: { id: south.restaurant.id } });
    assert.equal(east?.slug, `${created.tenant.slug}-east`);
  });

  it("adds a second restaurant to a different-name tenant without renaming the first host", async () => {
    const created = await signupTenantWithRestaurants({
      tenantName: `DiffSolo${suffix}`,
      billingEmail: `billing-diffsolo${suffix}@example.com`,
      restaurants: [
        {
          name: "XYZ",
          ownerEmail: `owner-diffsolo${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
      ],
    });
    assert.equal(created.restaurants[0].restaurant.slug, `${created.tenant.slug}-xyz`);
    const added = await addRestaurantToTenant(created.tenant.id, {
      name: "South",
      ownerEmail: `owner-diffsolo-south${suffix}@example.com`,
      ownerName: "Owner",
      ownerPassword: "password12",
    });
    assert.equal(added.restaurant.slug, `${created.tenant.slug}-south`);
    assert.equal(added.hostnameChanges.length, 0);
    const first = await prisma.restaurant.findUnique({ where: { id: created.restaurants[0].restaurant.id } });
    assert.equal(first?.slug, `${created.tenant.slug}-xyz`);
    clearHostTenantCache();
    const hub = await resolveTenantFromClassifiedHost(prod(created.tenant.slug));
    const xyz = await resolveTenantFromClassifiedHost(prod(`${created.tenant.slug}-xyz`));
    const south = await resolveTenantFromClassifiedHost(prod(`${created.tenant.slug}-south`));
    assert.equal(hub.ok && hub.kind, "tenant");
    assert.equal(xyz.ok && xyz.kind, "restaurant");
    assert.equal(south.ok && south.kind, "restaurant");
  });

  it("returns to a single restaurant host and drops the dedicated hub on delete", async () => {
    const created = await signupTenantWithRestaurants({
      tenantName: `BackSolo${suffix}`,
      billingEmail: `billing-backsolo${suffix}@example.com`,
      restaurants: [
        {
          name: `BackSolo${suffix}`,
          ownerEmail: `owner-backsolo${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
      ],
    });
    const added = await addRestaurantToTenant(created.tenant.id, {
      name: "South",
      ownerEmail: `owner-backsolo-south${suffix}@example.com`,
      ownerName: "Owner",
      ownerPassword: "password12",
    });
    await deleteRestaurantEverywhere(added.restaurant.id);
    clearHostTenantCache();
    const remaining = await prisma.restaurant.findUnique({
      where: { id: created.restaurants[0].restaurant.id },
    });
    assert.equal(remaining?.slug, created.tenant.slug);
    const hub = await prisma.hostSlug.findUnique({ where: { slug: created.tenant.slug } });
    assert.equal(hub?.kind, "restaurant");
    const resolved = await resolveTenantFromClassifiedHost(prod(created.tenant.slug));
    assert.equal(resolved.ok && resolved.kind, "restaurant");
    const tenantAdmin = await resolveTenantAdminHostContext(resolved);
    assert.ok(tenantAdmin);
    assert.equal(tenantAdmin.tenantId, created.tenant.id);
    assert.equal(tenantAdmin.hostKind, "restaurant");
  });

  it("allows /tenant on a single restaurant host and denies it on multi restaurant hosts", async () => {
    const single = await signupTenantWithRestaurants({
      tenantName: `AllowSolo${suffix}`,
      billingEmail: `billing-allowsolo${suffix}@example.com`,
      restaurants: [
        {
          name: `AllowSolo${suffix}`,
          ownerEmail: `owner-allowsolo${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
      ],
    });
    const singleResolved = await resolveTenantFromClassifiedHost(prod(single.tenant.slug));
    const singleHost = await resolveTenantAdminHostContext(singleResolved);
    assert.ok(singleHost);
    assert.equal(singleHost.hostKind, "restaurant");

    const multi = await signupTenantWithRestaurants({
      tenantName: `DenyMulti${suffix}`,
      billingEmail: `billing-denymulti${suffix}@example.com`,
      restaurants: [
        {
          name: "ABC",
          ownerEmail: `owner-denymulti-a${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
        {
          name: "XYZ",
          ownerEmail: `owner-denymulti-x${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
      ],
    });
    const hub = await resolveTenantFromClassifiedHost(prod(multi.tenant.slug));
    const restaurant = await resolveTenantFromClassifiedHost(prod(`${multi.tenant.slug}-abc`));
    const hubHost = await resolveTenantAdminHostContext(hub);
    const restaurantHost = await resolveTenantAdminHostContext(restaurant);
    assert.ok(hubHost);
    assert.equal(hubHost.hostKind, "tenant");
    assert.equal(restaurantHost, null);
  });

  it("never grants Tenant A context from Tenant B restaurant or hub hosts", async () => {
    const tenantA = await signupTenantWithRestaurants({
      tenantName: `IsoA${suffix}`,
      billingEmail: `billing-isoa${suffix}@example.com`,
      restaurants: [
        {
          name: `IsoA${suffix}`,
          ownerEmail: `owner-isoa${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
      ],
    });
    const tenantB = await signupTenantWithRestaurants({
      tenantName: `IsoB${suffix}`,
      billingEmail: `billing-isob${suffix}@example.com`,
      restaurants: [
        {
          name: "South",
          ownerEmail: `owner-isob-s${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
        {
          name: "North",
          ownerEmail: `owner-isob-n${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
      ],
    });
    const aHost = await resolveTenantAdminHostContext(
      await resolveTenantFromClassifiedHost(prod(tenantA.tenant.slug)),
    );
    const bHub = await resolveTenantAdminHostContext(
      await resolveTenantFromClassifiedHost(prod(tenantB.tenant.slug)),
    );
    const bRestaurant = await resolveTenantAdminHostContext(
      await resolveTenantFromClassifiedHost(prod(`${tenantB.tenant.slug}-south`)),
    );
    assert.equal(aHost?.tenantId, tenantA.tenant.id);
    assert.equal(bHub?.tenantId, tenantB.tenant.id);
    assert.equal(bRestaurant, null);
    assert.notEqual(aHost?.tenantId, tenantB.tenant.id);
  });

  it("removes obsolete single-restaurant tenant_hub leases without touching restaurant hosts", async () => {
    const created = await signupTenantWithRestaurants({
      tenantName: `StaleHub${suffix}`,
      billingEmail: `billing-stalehub${suffix}@example.com`,
      restaurants: [
        {
          name: "XYZ",
          ownerEmail: `owner-stalehub${suffix}@example.com`,
          ownerName: "Owner",
          ownerPassword: "password12",
        },
      ],
    });
    const restaurantSlug = created.restaurants[0].restaurant.slug;
    await prisma.hostSlug.create({
      data: {
        slug: created.tenant.slug,
        kind: "tenant_hub",
        tenantId: created.tenant.id,
        restaurantId: null,
      },
    });
    await removeObsoleteSingleRestaurantTenantHubs(prisma);
    assert.equal(await prisma.hostSlug.findUnique({ where: { slug: created.tenant.slug } }), null);
    const restaurantLease = await prisma.hostSlug.findUnique({ where: { slug: restaurantSlug } });
    assert.equal(restaurantLease?.kind, "restaurant");
    assert.equal(restaurantLease?.restaurantId, created.restaurants[0].restaurant.id);
  });
});

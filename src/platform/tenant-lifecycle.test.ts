import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { prisma } from "@/lib/prisma";
import {
  setTenantEnabled,
  setRestaurantEnabled,
  deleteRestaurantEverywhere,
  deleteTenantEverywhere,
} from "@/lib/tenant-lifecycle";

const prefix = `lifecycle-test-${Date.now()}`;
const createdTenantIds: string[] = [];

async function cleanup() {
  for (const tenantId of createdTenantIds.splice(0)) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { restaurants: { select: { id: true } } },
    });
    if (!tenant) continue;
    for (const restaurant of tenant.restaurants) {
      await prisma.loginAuditLog.deleteMany({ where: { restaurantId: restaurant.id } });
      await prisma.backgroundJob.deleteMany({ where: { restaurantId: restaurant.id } });
      await prisma.restaurant.delete({ where: { id: restaurant.id } }).catch(() => undefined);
    }
    await prisma.loginAuditLog.deleteMany({ where: { tenantId } });
    await prisma.backgroundJob.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
  }
}

afterEach(async () => {
  await cleanup();
});

describe("tenant and restaurant lifecycle", () => {
  it("disabling a tenant disables every restaurant under it", async () => {
    const tenant = await prisma.tenant.create({
      data: { name: `${prefix} Tenant`, slug: `${prefix}-tenant` },
    });
    createdTenantIds.push(tenant.id);

    const south = await prisma.restaurant.create({
      data: { name: "South", slug: `${prefix}-south`, tenantId: tenant.id, isEnabled: true },
    });
    const east = await prisma.restaurant.create({
      data: { name: "East", slug: `${prefix}-east`, tenantId: tenant.id, isEnabled: true },
    });

    const result = await setTenantEnabled(tenant.id, false);
    assert.equal(result.isEnabled, false);
    assert.equal(result.restaurantCount, 2);

    const after = await prisma.restaurant.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, isEnabled: true },
    });
    assert.equal(after.length, 2);
    assert.ok(after.every((restaurant) => restaurant.isEnabled === false));

    await setTenantEnabled(tenant.id, true);
    const reenabled = await prisma.restaurant.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, isEnabled: true },
    });
    assert.ok(reenabled.every((restaurant) => restaurant.isEnabled === false));

    await setRestaurantEnabled(south.id, true);
    assert.equal((await prisma.restaurant.findUnique({ where: { id: south.id } }))?.isEnabled, true);
    assert.equal((await prisma.restaurant.findUnique({ where: { id: east.id } }))?.isEnabled, false);
  });

  it("delete restaurant and delete tenant wipe related rows", async () => {
    const tenant = await prisma.tenant.create({
      data: {
        name: `${prefix} Wipe`,
        slug: `${prefix}-wipe`,
        subscriptions: { create: { plan: "STARTER", status: "TRIAL" } },
      },
    });
    createdTenantIds.push(tenant.id);

    const keep = await prisma.restaurant.create({
      data: { name: "Keep", slug: `${prefix}-keep`, tenantId: tenant.id },
    });
    const gone = await prisma.restaurant.create({
      data: { name: "Gone", slug: `${prefix}-gone`, tenantId: tenant.id },
    });

    await prisma.loginAuditLog.create({
      data: {
        kind: "staff_login",
        success: true,
        email: "owner@example.com",
        tenantId: tenant.id,
        restaurantId: gone.id,
      },
    });
    await prisma.backgroundJob.create({
      data: {
        type: "test_job",
        payload: "{}",
        restaurantId: gone.id,
        tenantId: tenant.id,
      },
    });

    await deleteRestaurantEverywhere(gone.id);
    assert.equal(await prisma.restaurant.findUnique({ where: { id: gone.id } }), null);
    assert.equal(await prisma.loginAuditLog.count({ where: { restaurantId: gone.id } }), 0);
    assert.equal(await prisma.backgroundJob.count({ where: { restaurantId: gone.id } }), 0);
    assert.ok(await prisma.restaurant.findUnique({ where: { id: keep.id } }));

    await prisma.loginAuditLog.create({
      data: {
        kind: "staff_login",
        success: true,
        email: "keep@example.com",
        tenantId: tenant.id,
        restaurantId: keep.id,
      },
    });

    await deleteTenantEverywhere(tenant.id);
    assert.equal(await prisma.tenant.findUnique({ where: { id: tenant.id } }), null);
    assert.equal(await prisma.restaurant.findUnique({ where: { id: keep.id } }), null);
    assert.equal(await prisma.loginAuditLog.count({ where: { tenantId: tenant.id } }), 0);
    assert.equal(await prisma.tenantSubscription.count({ where: { tenantId: tenant.id } }), 0);
  });
});

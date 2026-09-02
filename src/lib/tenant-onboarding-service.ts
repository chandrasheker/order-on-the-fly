import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import type { Prisma, PrismaClient, TenantPlan } from "@/generated/prisma/client";
import { slugify } from "@/lib/utils";
import { ensureStarterMenuCategories } from "@/lib/menu-setup-service";
import {
  getActiveStaffSessionsByRestaurants,
  summarizeActiveSessions,
} from "@/lib/staff-session-service";
import { restaurantSlugValidationError } from "@/lib/restaurant-slug";
import { invalidateHostTenantCacheForSlugs } from "@/platform/host-tenant";
import {
  assertMultiRestaurantNaming,
  assertRestaurantName,
  assertTenantName,
  assertUniqueRestaurantNames,
  canonicalizeName,
  plannedRestaurantHostSlug,
  tenantHubIsActive,
} from "@/lib/hostname-rules";
import {
  assertHostnameAvailable,
  assertRestaurantNameAvailableInTenant,
  assertTenantNameAvailable,
  generatedRestaurantSlug,
  generatedTenantSlug,
  syncTenantHostLeases,
} from "@/lib/hostname-allocation";

type Db = PrismaClient | Prisma.TransactionClient;

export type SignupTenantInput = {
  tenantName: string;
  tenantSlug?: string;
  billingEmail: string;
  plan?: TenantPlan;
  restaurantName: string;
  restaurantSlug?: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  tableCount?: number;
};

export type SignupRestaurantInput = {
  name: string;
  slug?: string;
  tableCount?: number;
  ownerEmail: string;
  ownerName: string;
  ownerPassword: string;
};

export type SignupTenantGroupInput = {
  tenantName: string;
  tenantSlug?: string;
  billingEmail: string;
  plan?: TenantPlan;
  restaurants: SignupRestaurantInput[];
};

async function bootstrapRestaurant(
  tx: Db,
  tenant: { id: string },
  input: {
    name: string;
    slug: string;
    ownerEmail: string;
    ownerName: string;
    ownerPassword: string;
    passwordHash: string;
    tableCount?: number;
  },
) {
  const restaurant = await tx.restaurant.create({
    data: {
      name: input.name,
      nameNormalized: canonicalizeName(input.name),
      slug: input.slug,
      tenantId: tenant.id,
      isEnabled: true,
      ownerSlots: 1,
      managerSlots: 1,
      cookSlots: 1,
      serverSlots: 2,
      staffConfigured: true,
    },
  });

  const branch = await tx.branch.create({
    data: {
      restaurantId: restaurant.id,
      tenantId: tenant.id,
      name: "Main",
      slug: "main",
      isDefault: true,
    },
  });

  const floor = await tx.floor.create({
    data: {
      branchId: branch.id,
      restaurantId: restaurant.id,
      tenantId: tenant.id,
      name: "Ground Floor",
      slug: "ground",
      isDefault: true,
    },
  });

  const owner = await tx.user.create({
    data: {
      email: input.ownerEmail.toLowerCase(),
      name: input.ownerName,
      role: "OWNER",
      slotKey: "owner1",
      passwordHash: input.passwordHash,
      plainPassword: input.ownerPassword,
      restaurantId: restaurant.id,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const tableCount = Math.max(1, Math.min(50, input.tableCount ?? 6));
  await tx.table.createMany({
    data: Array.from({ length: tableCount }, (_, i) => ({
      number: i + 1,
      qrToken: `${input.slug}-table-${i + 1}`,
      restaurantId: restaurant.id,
      tenantId: tenant.id,
      branchId: branch.id,
      floorId: floor.id,
    })),
  });

  return { restaurant, branch, floor, owner };
}

export async function signupTenantWithRestaurant(input: SignupTenantInput) {
  if (input.restaurantSlug) {
    const slugError = restaurantSlugValidationError(input.restaurantSlug.trim().toLowerCase());
    if (slugError) throw new Error(slugError);
  }
  const result = await signupTenantWithRestaurants({
    tenantName: input.tenantName,
    tenantSlug: input.tenantSlug,
    billingEmail: input.billingEmail,
    plan: input.plan,
    restaurants: [
      {
        name: input.restaurantName,
        slug: input.restaurantSlug,
        tableCount: input.tableCount,
        ownerEmail: input.ownerEmail,
        ownerName: input.ownerName,
        ownerPassword: input.ownerPassword,
      },
    ],
  });
  return {
    tenant: result.tenant,
    restaurant: result.restaurants[0].restaurant,
    branch: result.restaurants[0].branch,
    floor: result.restaurants[0].floor,
    owner: result.restaurants[0].owner,
    tenantAdmin: result.tenantAdmin,
  };
}

export async function signupTenantWithRestaurants(input: SignupTenantGroupInput) {
  const tenantName = assertTenantName(input.tenantName);
  if (!input.restaurants.length) throw new Error("At least one restaurant is required");
  const restaurantNames = input.restaurants.map((restaurant) => assertRestaurantName(restaurant.name));
  assertUniqueRestaurantNames(restaurantNames);
  assertMultiRestaurantNaming(tenantName, restaurantNames);

  const tenantSlug = generatedTenantSlug(tenantName, input.tenantSlug);
  const planned = input.restaurants.map((restaurant) => ({
    ...restaurant,
    name: assertRestaurantName(restaurant.name),
    slug: generatedRestaurantSlug({
      tenantSlug,
      tenantName,
      restaurantName: restaurant.name,
      totalRestaurantCount: input.restaurants.length,
      explicitSlug: restaurant.slug,
    }),
    ownerEmail: restaurant.ownerEmail.trim().toLowerCase(),
    ownerName: restaurant.ownerName.trim() || "Owner",
    ownerPassword: restaurant.ownerPassword,
  }));

  const emails = planned.map((restaurant) => restaurant.ownerEmail);
  if (new Set(emails).size !== emails.length) {
    throw new Error("Each restaurant owner email must be unique");
  }

  const hashed = await Promise.all(
    planned.map(async (restaurant) => ({
      ...restaurant,
      passwordHash: await bcrypt.hash(restaurant.ownerPassword, 10),
    })),
  );

  const result = await prisma.$transaction(async (tx) => {
    await assertTenantNameAvailable(tx, tenantName);
    await assertHostnameAvailable(tx, tenantSlug);

    for (const restaurant of hashed) {
      await assertHostnameAvailable(tx, restaurant.slug, { tenantHubId: undefined });
      const emailTaken = await tx.user.findUnique({ where: { email: restaurant.ownerEmail } });
      if (emailTaken) throw new Error("Owner email already registered");
    }

    const tenant = await tx.tenant.create({
      data: {
        name: tenantName,
        nameNormalized: canonicalizeName(tenantName),
        slug: tenantSlug,
        isEnabled: true,
        plan: input.plan ?? "STARTER",
        subscriptionStatus: "TRIAL",
        billingEmail: input.billingEmail,
        subscriptions: {
          create: {
            plan: input.plan ?? "STARTER",
            status: "TRIAL",
            currentPeriodEnd: new Date(Date.now() + 14 * 86400000),
          },
        },
      },
    });

    const created = [];
    for (const restaurant of hashed) {
      created.push(await bootstrapRestaurant(tx, tenant, restaurant));
    }

    const first = hashed[0];
    const tenantAdmin = await tx.tenantAdmin.create({
      data: {
        tenantId: tenant.id,
        email: first.ownerEmail,
        name: first.ownerName,
        passwordHash: first.passwordHash,
      },
    });

    await syncTenantHostLeases(tx, {
      tenantId: tenant.id,
      tenantSlug,
      tenantName,
      restaurants: created.map((row) => ({
        id: row.restaurant.id,
        name: row.restaurant.name,
        slug: row.restaurant.slug,
      })),
    });

    return { tenant, restaurants: created, tenantAdmin };
  });

  for (const row of result.restaurants) {
    await ensureStarterMenuCategories(row.restaurant.id);
  }
  invalidateHostTenantCacheForSlugs([
    result.tenant.slug,
    ...result.restaurants.map((row) => row.restaurant.slug),
  ]);
  return result;
}

export async function addRestaurantToTenant(
  tenantId: string,
  input: {
    name: string;
    slug?: string;
    tableCount?: number;
    ownerEmail: string;
    ownerName: string;
    ownerPassword?: string;
  },
) {
  const name = assertRestaurantName(input.name);
  const password = input.ownerPassword || "changeme123";
  const passwordHash = await bcrypt.hash(password, 10);
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  const slugsToInvalidate = new Set<string>();

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      include: { restaurants: { select: { id: true, name: true, slug: true } } },
    });
    if (!tenant) throw new Error("Tenant not found");

    const nextNames = [...tenant.restaurants.map((restaurant) => restaurant.name), name];
    assertUniqueRestaurantNames(nextNames);
    assertMultiRestaurantNaming(tenant.name, nextNames);
    await assertRestaurantNameAvailableInTenant(tx, tenantId, name);

    const slug = generatedRestaurantSlug({
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      restaurantName: name,
      totalRestaurantCount: tenant.restaurants.length + 1,
      explicitSlug: input.slug,
    });
    await assertHostnameAvailable(tx, slug, { tenantHubId: tenant.id });

    const emailTaken = await tx.user.findUnique({ where: { email: ownerEmail } });
    if (emailTaken) throw new Error("Owner email already in use");

    const created = await bootstrapRestaurant(tx, tenant, {
      name,
      slug,
      ownerEmail,
      ownerName: input.ownerName.trim() || "Owner",
      ownerPassword: password,
      passwordHash,
      tableCount: input.tableCount,
    });

    const restaurants = [
      ...tenant.restaurants,
      { id: created.restaurant.id, name: created.restaurant.name, slug: created.restaurant.slug },
    ];
    await syncTenantHostLeases(tx, {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      restaurants,
    });

    slugsToInvalidate.add(tenant.slug);
    slugsToInvalidate.add(slug);
    for (const restaurant of tenant.restaurants) slugsToInvalidate.add(restaurant.slug);

    return created;
  });

  await ensureStarterMenuCategories(result.restaurant.id);
  invalidateHostTenantCacheForSlugs(slugsToInvalidate);
  return result;
}

export async function renameTenant(tenantId: string, nextName: string) {
  const tenantName = assertTenantName(nextName);
  const slugsToInvalidate = new Set<string>();

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      include: { restaurants: { select: { id: true, name: true, slug: true } } },
    });
    if (!tenant) throw new Error("Tenant not found");

    assertMultiRestaurantNaming(tenantName, tenant.restaurants.map((restaurant) => restaurant.name));
    await assertTenantNameAvailable(tx, tenantName, tenantId);

    const tenantSlug = generatedTenantSlug(tenantName);
    const count = tenant.restaurants.length;
    const updates = tenant.restaurants.map((restaurant) => ({
      id: restaurant.id,
      name: restaurant.name,
      previousSlug: restaurant.slug,
      slug: plannedRestaurantHostSlug({
        tenantSlug,
        tenantName,
        restaurantName: restaurant.name,
        totalRestaurantCount: count,
      }),
    }));

    slugsToInvalidate.add(tenant.slug);
    slugsToInvalidate.add(tenantSlug);
    for (const row of updates) {
      slugsToInvalidate.add(row.previousSlug);
      slugsToInvalidate.add(row.slug);
    }

    for (const row of updates) {
      await assertHostnameAvailable(tx, row.slug, {
        restaurantId: row.id,
        tenantHubId: tenant.id,
      });
    }
    if (tenantHubIsActive({ tenantSlug, tenantName, restaurants: updates })) {
      await assertHostnameAvailable(tx, tenantSlug, { tenantHubId: tenant.id });
    }

    await tx.tenant.update({
      where: { id: tenantId },
      data: { name: tenantName, nameNormalized: canonicalizeName(tenantName), slug: tenantSlug },
    });
    for (const row of updates) {
      await tx.restaurant.update({
        where: { id: row.id },
        data: { slug: row.slug },
      });
    }
    await syncTenantHostLeases(tx, {
      tenantId,
      tenantSlug,
      tenantName,
      restaurants: updates.map((row) => ({ id: row.id, name: row.name, slug: row.slug })),
    });

    return {
      tenant: { id: tenantId, name: tenantName, slug: tenantSlug, previousSlug: tenant.slug },
      restaurants: updates,
    };
  });

  invalidateHostTenantCacheForSlugs(slugsToInvalidate);
  return result;
}

export async function renameRestaurant(restaurantId: string, nextName: string) {
  const name = assertRestaurantName(nextName);
  const slugsToInvalidate = new Set<string>();

  const result = await prisma.$transaction(async (tx) => {
    const restaurant = await tx.restaurant.findUnique({
      where: { id: restaurantId },
      include: { tenant: { include: { restaurants: { select: { id: true, name: true, slug: true } } } } },
    });
    if (!restaurant?.tenant) throw new Error("Restaurant not found");
    const tenant = restaurant.tenant;

    const nextNames = tenant.restaurants.map((row) => (row.id === restaurantId ? name : row.name));
    assertUniqueRestaurantNames(nextNames);
    assertMultiRestaurantNaming(tenant.name, nextNames);
    await assertRestaurantNameAvailableInTenant(tx, tenant.id, name, restaurantId);

    const nextRestaurants = tenant.restaurants.map((row) => {
      if (row.id !== restaurantId) {
        return { id: row.id, name: row.name, previousSlug: row.slug, slug: row.slug };
      }
      return {
        id: row.id,
        name,
        previousSlug: row.slug,
        slug: plannedRestaurantHostSlug({
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
          restaurantName: name,
          totalRestaurantCount: tenant.restaurants.length,
        }),
      };
    });

    slugsToInvalidate.add(tenant.slug);
    for (const row of nextRestaurants) {
      slugsToInvalidate.add(row.previousSlug);
      slugsToInvalidate.add(row.slug);
    }

    for (const row of nextRestaurants) {
      await assertHostnameAvailable(tx, row.slug, {
        restaurantId: row.id,
        tenantHubId: tenant.id,
      });
    }

    await tx.restaurant.update({
      where: { id: restaurantId },
      data: { name, nameNormalized: canonicalizeName(name) },
    });
    for (const row of nextRestaurants) {
      if (row.slug !== row.previousSlug) {
        await tx.restaurant.update({ where: { id: row.id }, data: { slug: row.slug } });
      }
    }
    await syncTenantHostLeases(tx, {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      restaurants: nextRestaurants.map((row) => ({ id: row.id, name: row.name, slug: row.slug })),
    });

    return {
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      restaurants: nextRestaurants,
    };
  });

  invalidateHostTenantCacheForSlugs(slugsToInvalidate);
  return result;
}

export async function addBranchToRestaurant(
  restaurantId: string,
  input: { name: string; slug?: string; address?: string },
) {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant) throw new Error("Restaurant not found");

  const slug = input.slug || slugify(input.name);
  const branch = await prisma.branch.create({
    data: {
      restaurantId,
      tenantId: restaurant.tenantId,
      name: input.name,
      slug,
      address: input.address ?? null,
      isDefault: false,
    },
  });

  await prisma.floor.create({
    data: {
      branchId: branch.id,
      restaurantId,
      tenantId: restaurant.tenantId,
      name: "Ground Floor",
      slug: "ground",
      isDefault: true,
    },
  });

  return branch;
}

export async function listTenantsWithRestaurants() {
  const tenants = await prisma.tenant.findMany({
    orderBy: { name: "asc" },
    include: {
      restaurants: {
        orderBy: { name: "asc" },
        include: {
          branches: { orderBy: { name: "asc" }, include: { floors: true } },
          _count: { select: { users: true, orders: true, tables: true } },
        },
      },
      subscriptions: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return tenants;
}

export async function getTenantOverview(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      restaurants: {
        include: {
          _count: { select: { orders: true, users: true, tables: true } },
        },
      },
      subscriptions: { orderBy: { createdAt: "desc" }, take: 12 },
    },
  });
  if (!tenant) return null;

  const today = new Date().toISOString().slice(0, 10);
  const ordersToday = await prisma.order.count({
    where: {
      tenantId,
      date: today,
      status: { not: "CANCELLED" },
    },
  });

  const restaurantIds = tenant.restaurants.map((r) => r.id);
  const activeByRestaurant = await getActiveStaffSessionsByRestaurants(restaurantIds);

  const restaurantsWithSessions = tenant.restaurants.map((restaurant) => ({
    id: restaurant.id,
    name: restaurant.name,
    slug: restaurant.slug,
    isEnabled: restaurant.isEnabled,
    _count: restaurant._count,
    activeSessions: summarizeActiveSessions(activeByRestaurant.get(restaurant.id) ?? []),
  }));

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan,
      subscriptionStatus: tenant.subscriptionStatus,
      isEnabled: tenant.isEnabled,
      hubActive: tenantHubIsActive({
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        restaurants: tenant.restaurants,
      }),
    },
    restaurants: restaurantsWithSessions,
    stats: {
      restaurantCount: tenant.restaurants.length,
      ordersToday,
      totalOrders: tenant.restaurants.reduce((s, r) => s + r._count.orders, 0),
      totalStaff: tenant.restaurants.reduce((s, r) => s + r._count.users, 0),
      totalTables: tenant.restaurants.reduce((s, r) => s + r._count.tables, 0),
      activeLogins: restaurantsWithSessions.reduce((s, r) => s + r.activeSessions.total, 0),
    },
  };
}

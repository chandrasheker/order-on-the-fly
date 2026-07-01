import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import type { TenantPlan } from "@/generated/prisma/client";
import { slugify } from "@/lib/utils";
import { ensureStarterMenuCategories } from "@/lib/menu-setup-service";

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

export async function signupTenantWithRestaurant(input: SignupTenantInput) {
  const tenantSlug = input.tenantSlug || slugify(input.tenantName);
  const restaurantSlug = input.restaurantSlug || slugify(input.restaurantName);

  const existingTenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (existingTenant) throw new Error("Tenant slug already taken");

  const existingRestaurant = await prisma.restaurant.findUnique({ where: { slug: restaurantSlug } });
  if (existingRestaurant) throw new Error("Restaurant slug already taken");

  const existingUser = await prisma.user.findUnique({ where: { email: input.ownerEmail.toLowerCase() } });
  if (existingUser) throw new Error("Owner email already registered");

  const plan = input.plan ?? "STARTER";
  const passwordHash = await bcrypt.hash(input.ownerPassword, 10);

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: input.tenantName,
        slug: tenantSlug,
        plan,
        subscriptionStatus: "TRIAL",
        billingEmail: input.billingEmail,
        subscriptions: {
          create: {
            plan,
            status: "TRIAL",
            currentPeriodEnd: new Date(Date.now() + 14 * 86400000),
          },
        },
      },
    });

    const restaurant = await tx.restaurant.create({
      data: {
        name: input.restaurantName,
        slug: restaurantSlug,
        tenantId: tenant.id,
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
        passwordHash,
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
        qrToken: `${restaurantSlug}-table-${i + 1}`,
        restaurantId: restaurant.id,
        tenantId: tenant.id,
        branchId: branch.id,
        floorId: floor.id,
      })),
    });

    return { tenant, restaurant, branch, floor, owner };
  });

  await ensureStarterMenuCategories(result.restaurant.id);
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
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error("Tenant not found");

  const slug = input.slug || slugify(input.name);
  const existing = await prisma.restaurant.findUnique({ where: { slug } });
  if (existing) throw new Error("Restaurant slug already taken");

  const emailTaken = await prisma.user.findUnique({ where: { email: input.ownerEmail.toLowerCase() } });
  if (emailTaken) throw new Error("Owner email already in use");

  const password = input.ownerPassword || "changeme123";
  const passwordHash = await bcrypt.hash(password, 10);

  const result = await prisma.$transaction(async (tx) => {
    const restaurant = await tx.restaurant.create({
      data: {
        name: input.name,
        slug,
        tenantId,
        ownerSlots: 1,
        managerSlots: 1,
        cookSlots: 1,
        serverSlots: 2,
        staffConfigured: true,
      },
    });

    const branch = await tx.branch.create({
      data: { restaurantId: restaurant.id, tenantId, name: "Main", slug: "main", isDefault: true },
    });

    const floor = await tx.floor.create({
      data: {
        branchId: branch.id,
        restaurantId: restaurant.id,
        tenantId,
        name: "Ground Floor",
        slug: "ground",
        isDefault: true,
      },
    });

    await tx.user.create({
      data: {
        email: input.ownerEmail.toLowerCase(),
        name: input.ownerName,
        role: "OWNER",
        slotKey: "owner1",
        passwordHash,
        plainPassword: password,
        restaurantId: restaurant.id,
        tenantId,
        branchId: branch.id,
      },
    });

    const tableCount = Math.max(1, Math.min(50, input.tableCount ?? 6));
    await tx.table.createMany({
      data: Array.from({ length: tableCount }, (_, i) => ({
        number: i + 1,
        qrToken: `${slug}-table-${i + 1}`,
        restaurantId: restaurant.id,
        tenantId,
        branchId: branch.id,
        floorId: floor.id,
      })),
    });

    return { restaurant, branch, floor };
  });

  await ensureStarterMenuCategories(result.restaurant.id);
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

  return {
    tenant,
    stats: {
      restaurantCount: tenant.restaurants.length,
      ordersToday,
      totalOrders: tenant.restaurants.reduce((s, r) => s + r._count.orders, 0),
      totalStaff: tenant.restaurants.reduce((s, r) => s + r._count.users, 0),
      totalTables: tenant.restaurants.reduce((s, r) => s + r._count.tables, 0),
    },
  };
}

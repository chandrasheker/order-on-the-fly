import "dotenv/config";
import { createRequire } from "node:module";
import { createPrismaClient } from "../src/lib/create-prisma-client";
import bcrypt from "bcryptjs";
import { FEATURE_CATALOG } from "../src/lib/feature-catalog";
import { ensureServiceTables } from "../src/lib/service-tables";
import type { TenantPlan } from "../src/generated/prisma/client";

const require = createRequire(import.meta.url);
const { loadDeploymentConfig } = require("../scripts/restaurant-config.js");

type StaffMember = {
  slotKey: string;
  role: "OWNER" | "MANAGER" | "COOK" | "SERVER";
  name: string;
  email: string;
  password: string;
};

type NormalizedRestaurant = {
  name: string;
  slug: string;
  logoUrl: string | null;
  backgroundImageUrl: string | null;
  tableCount: number;
  defaultMaxSessions: number;
  rewardThresholdTea: number;
  rewardThresholdBeverage: number;
  rewardTeaLabel: string;
  rewardBeverageLabel: string;
  counts: { owner: number; manager: number; cook: number; server: number };
  staff: StaffMember[];
  menu: Array<{
    name: string;
    slug: string;
    icon: string;
    sortOrder: number;
    items: Array<{
      name: string;
      description: string | null;
      price: number;
      prepTimeMinutes: number;
      isVeg: boolean;
      isSpicy: boolean;
      sortOrder: number;
    }>;
  }>;
  branches: Array<{
    name: string;
    slug: string;
    address: string | null;
    isDefault: boolean;
    floors: Array<{ name: string; slug: string; isDefault: boolean }>;
  }>;
  guestUrl: string;
};

async function seedRestaurant(
  prisma: ReturnType<typeof createPrismaClient>,
  entry: NormalizedRestaurant,
  tenantId: string,
  demoPremiumFlags: Record<string, boolean>,
) {
  const restaurant = await prisma.restaurant.create({
    data: {
      name: entry.name,
      slug: entry.slug,
      tenantId,
      logoUrl: entry.logoUrl,
      backgroundImageUrl: entry.backgroundImageUrl,
      rewardThresholdTea: entry.rewardThresholdTea,
      rewardThresholdBeverage: entry.rewardThresholdBeverage,
      rewardTeaLabel: entry.rewardTeaLabel,
      rewardBeverageLabel: entry.rewardBeverageLabel,
      defaultMaxSessions: entry.defaultMaxSessions,
      ownerSlots: entry.counts.owner,
      managerSlots: entry.counts.manager,
      cookSlots: entry.counts.cook,
      serverSlots: entry.counts.server,
      staffConfigured: true,
      featureFlags: JSON.stringify(demoPremiumFlags),
    },
  });

  for (const branchDef of entry.branches) {
    const branch = await prisma.branch.create({
      data: {
        restaurantId: restaurant.id,
        tenantId,
        name: branchDef.name,
        slug: branchDef.slug,
        isDefault: branchDef.isDefault,
        address: branchDef.address,
      },
    });

    for (const floorDef of branchDef.floors) {
      await prisma.floor.create({
        data: {
          branchId: branch.id,
          restaurantId: restaurant.id,
          tenantId,
          name: floorDef.name,
          slug: floorDef.slug,
          isDefault: floorDef.isDefault,
        },
      });
    }
  }

  const defaultBranch = await prisma.branch.findFirst({
    where: { restaurantId: restaurant.id, isDefault: true },
  });
  const defaultFloor = await prisma.floor.findFirst({
    where: { restaurantId: restaurant.id, isDefault: true },
  });

  await Promise.all(
    entry.staff.map(async (member) => {
      const passwordHash = await bcrypt.hash(member.password, 10);
      await prisma.user.create({
        data: {
          slotKey: member.slotKey,
          email: member.email,
          name: member.name,
          role: member.role,
          passwordHash,
          plainPassword: member.password,
          restaurantId: restaurant.id,
          tenantId,
          branchId: defaultBranch?.id ?? null,
        },
      });
    }),
  );

  const tableRows = [];
  for (let i = 1; i <= entry.tableCount; i++) {
    tableRows.push({
      number: i,
      qrToken: `${restaurant.slug}-table-${i}`,
      maxSessions: entry.defaultMaxSessions,
      restaurantId: restaurant.id,
      tenantId,
      branchId: defaultBranch?.id ?? null,
      floorId: defaultFloor?.id ?? null,
    });
  }
  if (tableRows.length) {
    await prisma.table.createMany({ data: tableRows });
  }

  await ensureServiceTables(restaurant.id, restaurant.slug);

  for (const cat of entry.menu) {
    const category = await prisma.menuCategory.create({
      data: {
        name: cat.name,
        slug: cat.slug,
        icon: cat.icon,
        sortOrder: cat.sortOrder,
        restaurantId: restaurant.id,
      },
    });

    if (cat.items.length) {
      await prisma.menuItem.createMany({
        data: cat.items.map((item) => ({
          name: item.name,
          description: item.description,
          price: item.price,
          prepTimeMinutes: item.prepTimeMinutes,
          isVeg: item.isVeg,
          isSpicy: item.isSpicy,
          sortOrder: item.sortOrder,
          categoryId: category.id,
        })),
      });
    }
  }

  return restaurant;
}

async function main() {
  const prisma = createPrismaClient();
  const config = loadDeploymentConfig();

  if (process.env.SEED_IF_EMPTY === "true") {
    const existingRestaurants = await prisma.restaurant.count();
    if (existingRestaurants > 0) {
      console.log("Seed skipped; database already has restaurant data.");
      await prisma.$disconnect();
      return;
    }
  }

  console.log(`🌱 Seeding from ${config.configPath} (${config.mode}, ${config.restaurants.length} restaurant(s))`);

  await prisma.alert.deleteMany();
  await prisma.tableSwitchRequest.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.menuCategory.deleteMany();
  await prisma.table.deleteMany();
  await prisma.floor.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.user.deleteMany();
  await prisma.platformAdmin.deleteMany();
  await prisma.tenantSubscription.deleteMany();
  await prisma.restaurant.deleteMany();
  await prisma.tenant.deleteMany();

  const demoPremiumFlags = Object.fromEntries(
    FEATURE_CATALOG.filter((f) => f.tier === "premium" || f.tier === "roadmap").map((f) => [
      f.key,
      true,
    ]),
  );

  const tenant = await prisma.tenant.create({
    data: {
      name: config.tenant.name,
      slug: config.tenant.slug,
      plan: (config.tenant.plan || "STARTER") as TenantPlan,
      subscriptionStatus: "TRIAL",
      billingEmail: config.tenant.billingEmail,
      subscriptions: {
        create: {
          plan: (config.tenant.plan || "STARTER") as TenantPlan,
          status: "TRIAL",
          currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        },
      },
    },
  });

  const seeded = [];
  for (const entry of config.restaurants) {
    const restaurant = await seedRestaurant(prisma, entry, tenant.id, demoPremiumFlags);
    seeded.push({ restaurant, entry });
    console.log(`  ✅ ${restaurant.name} (${restaurant.slug}) — owner ${entry.staff.find((s: StaffMember) => s.role === "OWNER")?.email}`);
  }

  const adminPasswordHash = await bcrypt.hash(config.platformAdmin.password, 10);
  await prisma.platformAdmin.upsert({
    where: { email: config.platformAdmin.email },
    create: {
      email: config.platformAdmin.email,
      passwordHash: adminPasswordHash,
      name: config.platformAdmin.name,
    },
    update: {
      passwordHash: adminPasswordHash,
      name: config.platformAdmin.name,
    },
  });

  console.log("\n✅ Database seeded!");
  console.log(`🏢 Tenant: ${tenant.name} (${tenant.slug})`);
  console.log(`🍽️  Restaurants: ${seeded.length}`);
  console.log(`🛠️  Platform admin: ${config.platformAdmin.email}`);
  for (const { restaurant, entry } of seeded) {
    console.log(`   • ${restaurant.name}: staff login ${entry.staff.find((s: StaffMember) => s.role === "OWNER")?.email}`);
    console.log(`     Guest check-in: ${entry.guestUrl}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

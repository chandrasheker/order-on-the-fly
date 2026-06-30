import "dotenv/config";
import { createRequire } from "node:module";
import { createPrismaClient } from "../src/lib/create-prisma-client";
import bcrypt from "bcryptjs";
import { FEATURE_CATALOG } from "../src/lib/feature-catalog";
import { ensureServiceTables } from "../src/lib/service-tables";

const require = createRequire(import.meta.url);
const { loadRestaurantConfig } = require("../scripts/restaurant-config.js");

type StaffMember = {
  slotKey: string;
  role: "OWNER" | "MANAGER" | "COOK" | "SERVER";
  name: string;
  email: string;
  password: string;
};

type MenuItem = {
  name: string;
  description: string | null;
  price: number;
  prepTimeMinutes: number;
  isVeg: boolean;
  isSpicy: boolean;
  sortOrder: number;
};

type MenuCategory = {
  name: string;
  slug: string;
  icon: string;
  sortOrder: number;
  items: MenuItem[];
};

async function main() {
  const prisma = createPrismaClient();
  const config = loadRestaurantConfig();

  if (process.env.SEED_IF_EMPTY === "true") {
    const existingRestaurants = await prisma.restaurant.count();
    if (existingRestaurants > 0) {
      console.log("Seed skipped; database already has restaurant data.");
      return;
    }
  }

  console.log(`🌱 Seeding from config: ${config.configPath}`);

  await prisma.alert.deleteMany();
  await prisma.tableSwitchRequest.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.menuCategory.deleteMany();
  await prisma.table.deleteMany();
  await prisma.user.deleteMany();
  await prisma.platformAdmin.deleteMany();
  await prisma.restaurant.deleteMany();

  const demoPremiumFlags = Object.fromEntries(
    FEATURE_CATALOG.filter((f) => f.tier === "premium" || f.tier === "roadmap").map((f) => [f.key, true])
  );

  const restaurant = await prisma.restaurant.create({
    data: {
      name: config.restaurant.name,
      slug: config.restaurant.slug,
      logoUrl: config.restaurant.logoUrl,
      backgroundImageUrl: config.restaurant.backgroundImageUrl,
      rewardThresholdTea: config.restaurant.rewardThresholdTea,
      rewardThresholdBeverage: config.restaurant.rewardThresholdBeverage,
      rewardTeaLabel: config.restaurant.rewardTeaLabel,
      rewardBeverageLabel: config.restaurant.rewardBeverageLabel,
      defaultMaxSessions: config.restaurant.defaultMaxSessions,
      ownerSlots: config.counts.owner,
      managerSlots: config.counts.manager,
      cookSlots: config.counts.cook,
      serverSlots: config.counts.server,
      staffConfigured: true,
      featureFlags: JSON.stringify(demoPremiumFlags),
    },
  });

  const staff: StaffMember[] = config.staff;
  await Promise.all(
    staff.map(async (member) => {
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
        },
      });
    }),
  );

  const tableRows: Array<{
    number: number;
    qrToken: string;
    maxSessions: number;
    restaurantId: string;
  }> = [];

  for (let i = 1; i <= config.restaurant.tableCount; i++) {
    tableRows.push({
      number: i,
      qrToken: `${restaurant.slug}-table-${i}`,
      maxSessions: config.restaurant.defaultMaxSessions,
      restaurantId: restaurant.id,
    });
  }
  if (tableRows.length) {
    await prisma.table.createMany({ data: tableRows });
  }

  await ensureServiceTables(restaurant.id, restaurant.slug);

  const menu: MenuCategory[] = config.menu;
  const menuItemRows: Array<{
    name: string;
    description: string | null;
    price: number;
    prepTimeMinutes: number;
    isVeg: boolean;
    isSpicy: boolean;
    sortOrder: number;
    categoryId: string;
  }> = [];

  for (const cat of menu) {
    const category = await prisma.menuCategory.create({
      data: {
        name: cat.name,
        slug: cat.slug,
        icon: cat.icon,
        sortOrder: cat.sortOrder,
        restaurantId: restaurant.id,
      },
    });

    for (const item of cat.items) {
      menuItemRows.push({
        name: item.name,
        description: item.description,
        price: item.price,
        prepTimeMinutes: item.prepTimeMinutes,
        isVeg: item.isVeg,
        isSpicy: item.isSpicy,
        sortOrder: item.sortOrder,
        categoryId: category.id,
      });
    }
  }

  if (menuItemRows.length) {
    await prisma.menuItem.createMany({ data: menuItemRows });
  }

  const adminPasswordHash = await bcrypt.hash(config.platformAdmin.password, 10);
  await prisma.platformAdmin.create({
    data: {
      email: config.platformAdmin.email,
      passwordHash: adminPasswordHash,
      name: config.platformAdmin.name,
    },
  });

  const totalItems = menu.reduce((sum, c) => sum + c.items.length, 0);
  console.log("✅ Database seeded!");
  console.log(`🏪 Restaurant: ${restaurant.name} (slug: ${restaurant.slug})`);
  console.log(
    `👥 Staff: ${config.counts.owner} owner, ${config.counts.manager} manager, ${config.counts.cook} cook, ${config.counts.server} server`,
  );
  console.log(`🍽️  Menu: ${menu.length} categories, ${totalItems} items`);
  console.log(`🪑 ${config.restaurant.tableCount} tables with QR codes ready`);
  console.log(`🔑 Owner login: ${config.primaryOwner.email}`);
  console.log(`🛠️  Platform admin: ${config.platformAdmin.email}`);
  console.log(
    `📱 Table 1 check-in URL: /order/${restaurant.slug}/${restaurant.slug}-table-1/check-in`,
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

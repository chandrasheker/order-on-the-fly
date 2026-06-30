import "dotenv/config";
import { createRequire } from "node:module";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { getDatabaseUrl, isPostgresUrl } from "../src/lib/db-url";
import bcrypt from "bcryptjs";

const require = createRequire(import.meta.url);
const { loadRestaurantConfig } = require("../scripts/restaurant-config.js");

async function createPrismaClient() {
  const databaseUrl = getDatabaseUrl();

  if (isPostgresUrl(databaseUrl)) {
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const { Pool } = await import("pg");
    const adapter = new PrismaPg(new Pool({ connectionString: databaseUrl }));
    return new PrismaClient({ adapter });
  }

  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  return new PrismaClient({ adapter });
}

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
  const prisma = await createPrismaClient();
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

  for (let i = 1; i <= config.restaurant.tableCount; i++) {
    await prisma.table.create({
      data: {
        number: i,
        qrToken: `${restaurant.slug}-table-${i}`,
        maxSessions: config.restaurant.defaultMaxSessions,
        restaurantId: restaurant.id,
      },
    });
  }

  const menu: MenuCategory[] = config.menu;
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
      await prisma.menuItem.create({
        data: {
          name: item.name,
          description: item.description,
          price: item.price,
          prepTimeMinutes: item.prepTimeMinutes,
          isVeg: item.isVeg,
          isSpicy: item.isSpicy,
          sortOrder: item.sortOrder,
          categoryId: category.id,
        },
      });
    }
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

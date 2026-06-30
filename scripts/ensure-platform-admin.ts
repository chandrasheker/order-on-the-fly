import "dotenv/config";
import { createRequire } from "node:module";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { getDatabaseUrl } from "../src/lib/db-url";

const require = createRequire(import.meta.url);
const { loadRestaurantConfig } = require("../scripts/restaurant-config.js");

const config = loadRestaurantConfig();
const ADMIN_EMAIL = config.platformAdmin.email;
const ADMIN_PASSWORD = config.platformAdmin.password;
const ADMIN_NAME = config.platformAdmin.name;

const adapter = new PrismaBetterSqlite3({ url: getDatabaseUrl() });
const prisma = new PrismaClient({ adapter });

async function main() {
  const existing = await prisma.platformAdmin.findUnique({
    where: { email: ADMIN_EMAIL },
  });

  if (!existing) {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await prisma.platformAdmin.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash,
        name: ADMIN_NAME,
      },
    });
    console.log(`Platform admin ready: ${ADMIN_EMAIL}`);
    return;
  }

  const valid = await bcrypt.compare(ADMIN_PASSWORD, existing.passwordHash);
  if (!valid) {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await prisma.platformAdmin.update({
      where: { email: ADMIN_EMAIL },
      data: { passwordHash },
    });
    console.log(`Platform admin password restored for ${ADMIN_EMAIL}`);
  }
}

main()
  .catch((err) => {
    console.error("Failed to ensure platform admin:", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

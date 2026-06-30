import "dotenv/config";
import { createRequire } from "node:module";
import bcrypt from "bcryptjs";
import { createPrismaClient } from "../src/lib/create-prisma-client";

const require = createRequire(import.meta.url);
const { loadRestaurantConfig } = require("../scripts/restaurant-config.js");

const config = loadRestaurantConfig();
const ADMIN_EMAIL = config.platformAdmin.email;
const ADMIN_PASSWORD = config.platformAdmin.password;
const ADMIN_NAME = config.platformAdmin.name;

async function main() {
  const prisma = createPrismaClient();
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
  } else {
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

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Failed to ensure platform admin:", err.message);
  process.exit(1);
});

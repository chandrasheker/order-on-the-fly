import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { getDatabaseUrl } from "../src/lib/db-url";

const ADMIN_EMAIL = "admin@varanasi.com";
const ADMIN_PASSWORD = "admin@varanasi";

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
        name: "Platform Admin",
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

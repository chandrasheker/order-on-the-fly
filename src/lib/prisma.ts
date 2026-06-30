import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { getDatabaseUrl, isPostgresUrl } from "@/lib/db-url";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient;
};

function createPrismaClient() {
  const databaseUrl = getDatabaseUrl();

  if (isPostgresUrl(databaseUrl)) {
    const adapter = new PrismaPg(new Pool({ connectionString: databaseUrl }));
    return new PrismaClient({ adapter });
  }

  const adapter = new PrismaBetterSqlite3({
    url: databaseUrl,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

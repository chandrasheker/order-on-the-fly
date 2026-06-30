import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { getDatabaseUrl, isPostgresUrl } from "@/lib/db-url";

function createPostgresClient(databaseUrl: string) {
  // Loaded at runtime only for PostgreSQL so SQLite-only installs can build without pg.
  const req = eval("require") as NodeRequire;
  const { PrismaPg } = req("@prisma/adapter-pg");
  const { Pool } = req("pg");
  const adapter = new PrismaPg(new Pool({ connectionString: databaseUrl }));
  return new PrismaClient({ adapter });
}

function createSqliteClient(databaseUrl: string) {
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  return new PrismaClient({ adapter });
}

export function createPrismaClient(databaseUrl = getDatabaseUrl()) {
  return isPostgresUrl(databaseUrl)
    ? createPostgresClient(databaseUrl)
    : createSqliteClient(databaseUrl);
}

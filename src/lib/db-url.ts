import path from "node:path";

/** Shared SQLite URL used by Prisma CLI, seed script, and runtime client. */
export function getDatabaseUrl() {
  return process.env.DATABASE_URL ?? `file:${path.join(process.cwd(), "dev.db")}`;
}

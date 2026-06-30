import path from "node:path";

function resolveSqlitePath(raw: string) {
  const filePath = raw.startsWith("file:") ? raw.slice(5) : raw;
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
}

export function isPostgresUrl(raw: string) {
  return raw.startsWith("postgres://") || raw.startsWith("postgresql://");
}

/** Shared database URL used by Prisma CLI, seed script, and runtime client. */
export function getDatabaseUrl() {
  const raw = process.env.DATABASE_URL ?? "file:./dev.db";
  if (isPostgresUrl(raw)) return raw;
  return `file:${resolveSqlitePath(raw)}`;
}

export function getDatabaseFilePath() {
  const raw = process.env.DATABASE_URL ?? "file:./dev.db";
  if (isPostgresUrl(raw)) {
    throw new Error("getDatabaseFilePath is only available for SQLite DATABASE_URL values");
  }
  return resolveSqlitePath(process.env.DATABASE_URL ?? "file:./dev.db");
}

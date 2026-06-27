import path from "node:path";

function resolveSqlitePath(raw: string) {
  const filePath = raw.startsWith("file:") ? raw.slice(5) : raw;
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
}

/** Shared SQLite URL used by Prisma CLI, seed script, and runtime client. */
export function getDatabaseUrl() {
  const raw = process.env.DATABASE_URL ?? "file:./dev.db";
  return `file:${resolveSqlitePath(raw)}`;
}

export function getDatabaseFilePath() {
  return resolveSqlitePath(process.env.DATABASE_URL ?? "file:./dev.db");
}

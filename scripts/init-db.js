const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

require("dotenv/config");
require("./ensure-env.js");

function resolveDbPath() {
  const raw = process.env.DATABASE_URL || "file:./dev.db";
  const filePath = raw.startsWith("file:") ? raw.slice(5) : raw;
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
}

function tableExists(dbPath, tableName) {
  if (!fs.existsSync(dbPath)) return false;
  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      )
      .get(tableName);
    db.close();
    return Boolean(row);
  } catch {
    return false;
  }
}

function hasSeedData(dbPath) {
  if (!tableExists(dbPath, "User")) return false;
  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare("SELECT COUNT(*) as count FROM User").get();
    db.close();
    return row.count > 0;
  } catch {
    return false;
  }
}

const dbPath = resolveDbPath();

console.log(`Database: ${dbPath}`);

try {
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
} catch (error) {
  console.error("Migration failed. Run: npm run db:setup");
  process.exit(1);
}

if (!tableExists(dbPath, "Table")) {
  console.error(
    "Database tables are missing after migration. Try: rm dev.db && npm run db:setup"
  );
  process.exit(1);
}

if (!hasSeedData(dbPath)) {
  console.log("Seeding demo restaurant data...");
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
}

console.log("Database ready.");

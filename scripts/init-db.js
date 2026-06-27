const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { logInfo, logError } = require("./logger");

require("dotenv/config");
require("./ensure-env.js");

const OWNER_EMAIL = "owner@varanasi.com";

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

function needsSeed(dbPath) {
  if (!tableExists(dbPath, "User")) return true;
  try {
    const Database = require("better-sqlite3");
    const bcrypt = require("bcryptjs");
    const db = new Database(dbPath, { readonly: true });
    const owner = db
      .prepare("SELECT email, passwordHash FROM User WHERE email = ?")
      .get(OWNER_EMAIL);
    db.close();
    if (!owner) return true;
    // Re-seed when demo login no longer works (stale or corrupted accounts).
    return !bcrypt.compareSync("admin123", owner.passwordHash);
  } catch {
    return true;
  }
}

const dbPath = resolveDbPath();

console.log(`Database: ${dbPath}`);
logInfo("init-db", "Initializing database", { dbPath });

try {
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
  execSync("npx prisma generate", { stdio: "inherit" });
  logInfo("init-db", "Migrations applied and Prisma client generated");
} catch (err) {
  logError("init-db", "Migration failed", { error: err.message });
  console.error("Migration failed. Run: npm run db:reset");
  process.exit(1);
}

if (!tableExists(dbPath, "Table")) {
  logError("init-db", "Database tables missing after migration");
  console.error(
    "Database tables are missing after migration. Run: npm run db:reset"
  );
  process.exit(1);
}

if (needsSeed(dbPath)) {
  logInfo("init-db", "Seeding restaurant data (Varanasi accounts)");
  console.log("Seeding restaurant data (Varanasi accounts)...");
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
} else {
  logInfo("init-db", "Seed skipped; owner account already exists");
}

logInfo("init-db", "Database ready", { login: OWNER_EMAIL });
console.log("Database ready.");
console.log(`Staff login: ${OWNER_EMAIL}`);

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { logInfo, logError } = require("./logger");
const { loadRestaurantConfig } = require("./restaurant-config");

require("dotenv/config");
require("./ensure-env.js");

const config = loadRestaurantConfig();
const OWNER_EMAIL = config.primaryOwner.email;
const OWNER_PASSWORD = config.primaryOwner.password;

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
    // Re-seed when the configured owner login no longer works (stale or corrupted accounts).
    return !bcrypt.compareSync(OWNER_PASSWORD, owner.passwordHash);
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
  execSync("npx tsx scripts/ensure-platform-admin.ts", { stdio: "inherit" });
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
  logInfo("init-db", "Seeding restaurant data", { restaurant: config.restaurant.name });
  console.log(`Seeding restaurant data (${config.restaurant.name})...`);
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
} else {
  logInfo("init-db", "Seed skipped; owner account already exists");
}

logInfo("init-db", "Database ready", { login: OWNER_EMAIL });
console.log("Database ready.");
console.log(`Staff login: ${OWNER_EMAIL}`);

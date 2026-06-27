const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

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
    const db = new Database(dbPath, { readonly: true });
    const owner = db
      .prepare("SELECT email FROM User WHERE email = ?")
      .get(OWNER_EMAIL);
    db.close();
    return !owner;
  } catch {
    return true;
  }
}

const dbPath = resolveDbPath();

console.log(`Database: ${dbPath}`);

try {
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
} catch {
  console.error("Migration failed. Run: npm run db:reset");
  process.exit(1);
}

if (!tableExists(dbPath, "Table")) {
  console.error(
    "Database tables are missing after migration. Run: npm run db:reset"
  );
  process.exit(1);
}

if (needsSeed(dbPath)) {
  console.log("Seeding restaurant data (Varanasi accounts)...");
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
}

console.log("Database ready.");
console.log(`Login: ${OWNER_EMAIL} / admin123`);

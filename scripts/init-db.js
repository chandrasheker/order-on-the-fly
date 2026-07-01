const { execSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { logInfo, logError } = require("./logger");
const { loadRestaurantConfig } = require("./restaurant-config");

require("dotenv/config");
require("./ensure-env.js");

const ROOT = process.cwd();
const config = loadRestaurantConfig();
const OWNER_EMAIL = config.primaryOwner.email;
const OWNER_PASSWORD = config.primaryOwner.password;

function resolveDbPath() {
  const raw = process.env.DATABASE_URL || "file:./dev.db";
  const filePath = raw.startsWith("file:") ? raw.slice(5) : raw;
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(ROOT, filePath);
}

function prismaCliArgs() {
  return [];
}

function runPrisma(subcommand) {
  const args = subcommand.trim().split(/\s+/);
  const prismaBin = path.join(ROOT, "node_modules", "prisma", "build", "index.js");
  if (!fs.existsSync(prismaBin)) {
    execSync(`npx prisma ${subcommand}`, { stdio: "inherit", cwd: ROOT, env: process.env });
    return;
  }
  const result = spawnSync(process.execPath, [prismaBin, ...args, ...prismaCliArgs()], {
    stdio: "inherit",
    cwd: ROOT,
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`prisma ${subcommand} failed`);
  }
}

function runTsx(scriptRelativePath) {
  const scriptPath = path.join(ROOT, scriptRelativePath);
  const tsxCli = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
  if (fs.existsSync(tsxCli)) {
    const result = spawnSync(process.execPath, [tsxCli, scriptPath], {
      stdio: "inherit",
      cwd: ROOT,
      env: process.env,
    });
    if (result.status !== 0) {
      throw new Error(`${scriptRelativePath} failed`);
    }
    return;
  }
  execSync(`npx tsx ${scriptRelativePath}`, { stdio: "inherit", cwd: ROOT, env: process.env });
}

function schemaPath() {
  return path.resolve(ROOT, process.env.PRISMA_SCHEMA || "prisma/schema.prisma");
}

function shouldRunPrismaGenerate() {
  if (process.env.FORCE_PRISMA_GENERATE === "1") return true;
  const clientEntry = path.join(ROOT, "src", "generated", "prisma", "client.ts");
  if (!fs.existsSync(clientEntry)) return true;
  try {
    return fs.statSync(schemaPath()).mtimeMs > fs.statSync(clientEntry).mtimeMs;
  } catch {
    return true;
  }
}

function openSqlite(readonly = true) {
  const dbPath = resolveDbPath();
  if (!fs.existsSync(dbPath)) return null;
  try {
    const Database = require("better-sqlite3");
    return { db: new Database(dbPath, { readonly }), dbPath };
  } catch {
    return null;
  }
}

function tableExists(db, tableName) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(tableName);
  return Boolean(row);
}

function needsSeed(db) {
  if (!tableExists(db, "User")) return true;
  try {
    const owner = db
      .prepare("SELECT email, passwordHash FROM User WHERE email = ?")
      .get(OWNER_EMAIL);
    if (!owner) return true;
    if (process.env.SKIP_SEED_PASSWORD_CHECK === "1") return false;
    const bcrypt = require("bcryptjs");
    return !bcrypt.compareSync(OWNER_PASSWORD, owner.passwordHash);
  } catch {
    return true;
  }
}

const dbPath = resolveDbPath();
console.log(`Database: ${dbPath}`);
logInfo("init-db", "Initializing database", { dbPath });

try {
  runPrisma("migrate deploy");
  if (shouldRunPrismaGenerate()) {
    runPrisma("generate");
    logInfo("init-db", "Prisma client generated");
  } else {
    logInfo("init-db", "Prisma client up to date (skipped generate)");
  }
  runTsx("scripts/ensure-platform-admin.ts");
} catch (err) {
  logError("init-db", "Migration failed", { error: err.message });
  console.error("Migration failed. Run: npm run db:reset");
  process.exit(1);
}

const sqlite = openSqlite(true);
if (!sqlite || !tableExists(sqlite.db, "Table")) {
  sqlite?.db.close();
  logError("init-db", "Database tables missing after migration");
  console.error("Database tables are missing after migration. Run: npm run db:reset");
  process.exit(1);
}

if (needsSeed(sqlite.db)) {
  sqlite.db.close();
  logInfo("init-db", "Seeding restaurant data", { restaurant: config.restaurant.name });
  console.log(`Seeding restaurant data (${config.restaurant.name})...`);
  runTsx("prisma/seed.ts");
} else {
  sqlite.db.close();
  logInfo("init-db", "Seed skipped; owner account already exists");
}

try {
  runTsx("scripts/backfill-tenant-branches.ts");
  runTsx("scripts/backfill-hierarchy.ts");
} catch (err) {
  logError("init-db", "Tenant/branch/floor backfill warning", { error: err.message });
}

logInfo("init-db", "Database ready", { login: OWNER_EMAIL });
console.log("Database ready.");
console.log(`Staff login (${config.restaurant.name}): ${config.primaryOwner.email}`);
console.log(`Platform admin login: ${config.platformAdmin.email}`);
console.log("Open / for staff sign-in, or /platform/login for platform admin.");

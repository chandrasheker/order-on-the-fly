const { execSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { logInfo, logError } = require("./logger");
const { loadDeploymentConfig, saveDeploymentMarker } = require("./restaurant-config");

require("dotenv/config");
require("./ensure-env.js");

const ROOT = process.cwd();
const deployment = loadDeploymentConfig();
const config = deployment;
const OWNER_EMAIL = deployment.primaryOwner?.email;
const OWNER_PASSWORD = deployment.primaryOwner?.password;

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
  if (process.env.FORCE_SEED === "1") return true;

  // Never re-seed a populated database on `npm run dev` — that would wipe a
  // db:reset:quad (or any other) setup when restaurant.config.json differs.
  try {
    const row = db.prepare("SELECT COUNT(*) AS count FROM User").get();
    return (row?.count ?? 0) === 0;
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
  logInfo("init-db", "Seeding deployment", {
    mode: deployment.mode,
    tenant: deployment.tenant.name,
    restaurants: deployment.restaurants.length,
    config: deployment.configPath,
  });
  console.log(
    `Seeding ${deployment.restaurants.length} restaurant(s) for tenant ${deployment.tenant.name}...`,
  );
  runTsx("prisma/seed.ts");
  saveDeploymentMarker(deployment.configPath);
} else {
  sqlite.db.close();
  logInfo("init-db", "Seed skipped; database already has users", {
    config: deployment.configPath,
  });
}

try {
  runTsx("scripts/backfill-tenant-branches.ts");
  runTsx("scripts/backfill-hierarchy.ts");
} catch (err) {
  logError("init-db", "Tenant/branch/floor backfill warning", { error: err.message });
}

logInfo("init-db", "Database ready", { login: OWNER_EMAIL, config: deployment.configPath });
console.log("Database ready.");
console.log(`Config: ${path.relative(ROOT, deployment.configPath)} (${deployment.restaurants.length} restaurant(s))`);
console.log(`Tenant: ${deployment.tenant.name} (${deployment.tenant.slug})`);

const qrBaseUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const configAppUrl = deployment.app.url.replace(/\/$/, "");
console.log(`QR / guest URLs use: ${qrBaseUrl} (APP_URL — read at runtime)`);
if (configAppUrl !== qrBaseUrl) {
  console.warn(
    `⚠️  restaurant config app.url (${configAppUrl}) differs from APP_URL (${qrBaseUrl}). ` +
      "Table QR codes use APP_URL from .env.",
  );
}
console.log(
  "Tip: if you change NEXT_PUBLIC_APP_URL, restart dev — APP_URL is synced automatically. " +
    "Run `rm -rf .next` only if client bundles still show an old URL.",
);

for (const r of deployment.restaurants) {
  console.log(`Staff login (${r.name}): ${r.primaryOwner.email}`);
}
console.log(`Platform admin login: ${deployment.platformAdmin.email}`);
console.log("Open / for staff sign-in, /tenant/signup for new tenants, or /platform/login for platform admin.");

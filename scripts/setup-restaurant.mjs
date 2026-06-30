#!/usr/bin/env node
/**
 * One-command restaurant setup.
 *
 * Usage:
 *   npm run setup                                 # interactive wizard
 *   npm run setup -- --from examples/pistahouse.config.json   # use an existing config
 *   npm run setup -- --from examples/pistahouse.config.json --start  # + start dev server
 *
 * It writes restaurant.config.json, then resets + seeds the database so the
 * app is ready to run for the chosen restaurant.
 */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const TARGET = path.join(ROOT, "restaurant.config.json");

const args = process.argv.slice(2);
function flag(name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
}
const fromPath = flag("--from");
const shouldStart = args.includes("--start");

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function writeConfig(config) {
  fs.writeFileSync(TARGET, JSON.stringify(config, null, 2) + "\n");
  console.log(`\n✓ Wrote ${path.relative(ROOT, TARGET)}`);
}

function validateConfig() {
  const { loadRestaurantConfig } = require("./restaurant-config.js");
  const loaded = loadRestaurantConfig();
  console.log(`✓ Config valid for "${loaded.restaurant.name}" (slug: ${loaded.restaurant.slug})`);
  return loaded;
}

function seedAndOptionallyStart() {
  console.log("\n🧱 Resetting and seeding the database for this restaurant...");
  execSync("npm run db:reset", { stdio: "inherit", cwd: ROOT });
  console.log("\n✅ Setup complete!");
  if (shouldStart) {
    console.log("\n🚀 Starting the app (npm run dev)...\n");
    execSync("npm run dev", { stdio: "inherit", cwd: ROOT });
  } else {
    console.log("\nNext step: run `npm run dev` and open the app.\n");
  }
}

async function fromExisting() {
  const src = path.resolve(ROOT, fromPath);
  if (!fs.existsSync(src)) {
    console.error(`Config not found: ${src}`);
    process.exit(1);
  }
  const parsed = JSON.parse(fs.readFileSync(src, "utf8"));
  writeConfig(parsed);
  validateConfig();
  seedAndOptionallyStart();
}

function buildStaffList(role, count) {
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push({ name: `${role} ${i + 1}` });
  }
  return list;
}

async function interactive() {
  const rl = readline.createInterface({ input, output });
  const ask = async (q, fallback = "") => {
    const ans = (await rl.question(fallback ? `${q} [${fallback}]: ` : `${q}: `)).trim();
    return ans || fallback;
  };
  const askInt = async (q, fallback) => {
    const ans = await ask(q, String(fallback));
    const n = parseInt(ans, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  console.log("\n=== TableTap restaurant setup ===\n");

  const name = await ask("Restaurant name", "My Restaurant");
  const slug = slugify(await ask("URL slug", slugify(name)));
  const appUrl = await ask("App URL (use your LAN IP for phones)", "http://localhost:3000");
  const tableCount = await askInt("Number of tables", 10);
  const domain = await ask("Staff email domain", `${slug}.com`);

  console.log("\n--- Platform admin (manages staff & passwords) ---");
  const adminName = await ask("Admin name", "Platform Admin");
  const adminEmail = await ask("Admin email", `admin@${domain}`);
  const adminPassword = await ask("Admin password", "ChangeThisAdminPass!");

  console.log("\n--- Owner account ---");
  const ownerName = await ask("Owner name", "Owner");
  const ownerEmail = await ask("Owner email", `owner@${domain}`);
  const ownerPassword = await ask("Owner password", "ChangeThisOwnerPass!");

  console.log("\n--- Team size ---");
  const managerCount = await askInt("Managers", 2);
  const cookCount = await askInt("Cooks", 3);
  const serverCount = await askInt("Servers", 4);
  const defaultPassword = await ask("Default staff password", "ChangeThisStaffPass!");

  const useSample = (await ask("Start with a sample menu? (y/n)", "y")).toLowerCase().startsWith("y");

  await rl.close();

  const sampleMenu = [
    { name: "Today's Special", icon: "⭐", items: [] },
    {
      name: "Beverages",
      icon: "🥤",
      items: [
        { name: "Water", description: "Chilled bottle", price: 30, prepTimeMinutes: 1, isVeg: true },
        { name: "Fresh Lime Soda", description: "Sweet or salted", price: 60, prepTimeMinutes: 3, isVeg: true },
      ],
    },
    {
      name: "Mains",
      icon: "🍛",
      items: [
        { name: "House Special", description: "Chef's signature dish", price: 220, prepTimeMinutes: 15, isVeg: true },
      ],
    },
  ];

  const config = {
    app: { name: "TableTap", url: appUrl },
    restaurant: {
      name,
      slug,
      logoUrl: null,
      backgroundImageUrl: null,
      tableCount,
      defaultMaxSessions: 2,
      rewards: {
        thresholdTea: 250,
        thresholdBeverage: 500,
        teaLabel: "Free Tea (next visit)",
        beverageLabel: "Free Beverage (next visit)",
      },
    },
    platformAdmin: { name: adminName, email: adminEmail, password: adminPassword },
    staff: {
      domain,
      defaultPassword,
      owners: [{ name: ownerName, email: ownerEmail, password: ownerPassword }],
      managers: buildStaffList("Manager", managerCount),
      cooks: buildStaffList("Cook", cookCount),
      servers: buildStaffList("Server", serverCount),
    },
    menu: useSample ? sampleMenu : [{ name: "Today's Special", icon: "⭐", items: [] }],
  };

  writeConfig(config);
  validateConfig();
  seedAndOptionallyStart();
}

if (fromPath) {
  await fromExisting();
} else {
  await interactive();
}

/**
 * Shared restaurant configuration loader + normalizer.
 *
 * This is the single source of truth that makes the whole app generic.
 * Instead of hard-coding one restaurant, all restaurant-specific values
 * (name, branding, staff, menu, tables, admin) come from a JSON config file.
 *
 * Resolution order:
 *   1. process.env.RESTAURANT_CONFIG  (explicit path)
 *   2. <repo>/restaurant.config.json  (per-deployment, git-ignored)
 *   3. <repo>/restaurant.config.example.json  (committed template/demo)
 *
 * Used by CommonJS scripts (init-db, ensure-env) and, via createRequire,
 * by the TypeScript seed / admin scripts.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

const ROLE_PREFIX = {
  OWNER: "owner",
  MANAGER: "manager",
  COOK: "cook",
  SERVER: "server",
};

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveConfigPath() {
  const candidates = [
    process.env.RESTAURANT_CONFIG && path.resolve(ROOT, process.env.RESTAURANT_CONFIG),
    path.join(ROOT, "restaurant.config.json"),
    path.join(ROOT, "restaurant.config.example.json"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error(
    "No restaurant config found. Create restaurant.config.json (copy restaurant.config.example.json) or run `npm run setup`.",
  );
}

function normalizeStaffGroup(role, entries, { domain, defaultPassword }) {
  const list = Array.isArray(entries) ? entries : [];
  const prefix = ROLE_PREFIX[role];

  return list.map((entry, index) => {
    const slotIndex = index + 1;
    const slotKey = `${prefix}${slotIndex}`;
    const fallbackName = `${prefix.charAt(0).toUpperCase()}${prefix.slice(1)} ${slotIndex}`;
    const email = (entry.email || `${slotKey}@${domain}`).toLowerCase();
    return {
      slotKey,
      role,
      name: entry.name || fallbackName,
      email,
      password: entry.password || defaultPassword,
    };
  });
}

function normalizeMenu(menu) {
  const categories = Array.isArray(menu) ? menu : [];
  return categories.map((cat, catIndex) => ({
    name: cat.name,
    slug: cat.slug || slugify(cat.name),
    icon: cat.icon || "🍽️",
    sortOrder: cat.sortOrder ?? catIndex,
    items: (Array.isArray(cat.items) ? cat.items : []).map((item, itemIndex) => ({
      name: item.name,
      description: item.description ?? null,
      price: Number(item.price) || 0,
      prepTimeMinutes: Number(item.prepTimeMinutes) || 10,
      isVeg: item.isVeg !== false,
      isSpicy: Boolean(item.isSpicy),
      sortOrder: item.sortOrder ?? itemIndex + 1,
    })),
  }));
}

function loadRestaurantConfig() {
  const configPath = resolveConfigPath();
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (err) {
    throw new Error(`Failed to parse restaurant config at ${configPath}: ${err.message}`);
  }

  const restaurant = raw.restaurant || {};
  const name = restaurant.name || "My Restaurant";
  const slug = restaurant.slug || slugify(name);
  if (!slug) {
    throw new Error("restaurant.slug (or a usable restaurant.name) is required in the config.");
  }

  const staffInput = raw.staff || {};
  const domain = staffInput.domain || `${slug}.com`;
  const defaultPassword = staffInput.defaultPassword || "changeme123";

  const staff = [
    ...normalizeStaffGroup("OWNER", staffInput.owners, { domain, defaultPassword }),
    ...normalizeStaffGroup("MANAGER", staffInput.managers, { domain, defaultPassword }),
    ...normalizeStaffGroup("COOK", staffInput.cooks, { domain, defaultPassword }),
    ...normalizeStaffGroup("SERVER", staffInput.servers, { domain, defaultPassword }),
  ];

  if (staff.filter((s) => s.role === "OWNER").length === 0) {
    throw new Error("At least one owner is required in staff.owners.");
  }

  const counts = {
    owner: staff.filter((s) => s.role === "OWNER").length,
    manager: staff.filter((s) => s.role === "MANAGER").length,
    cook: staff.filter((s) => s.role === "COOK").length,
    server: staff.filter((s) => s.role === "SERVER").length,
  };

  const primaryOwner = staff.find((s) => s.role === "OWNER");

  const adminInput = raw.platformAdmin || {};
  const platformAdmin = {
    name: adminInput.name || "Platform Admin",
    email: (adminInput.email || `admin@${domain}`).toLowerCase(),
    password: adminInput.password || defaultPassword,
  };

  const rewards = restaurant.rewards || {};
  const app = raw.app || {};

  return {
    configPath,
    app: {
      url: app.url || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      name: app.name || "TableTap",
    },
    restaurant: {
      name,
      slug,
      logoUrl: restaurant.logoUrl ?? null,
      backgroundImageUrl: restaurant.backgroundImageUrl ?? null,
      tableCount: Number(restaurant.tableCount) > 0 ? Number(restaurant.tableCount) : 10,
      defaultMaxSessions:
        Number(restaurant.defaultMaxSessions) > 0 ? Number(restaurant.defaultMaxSessions) : 2,
      rewardThresholdTea: Number(rewards.thresholdTea) || 250,
      rewardThresholdBeverage: Number(rewards.thresholdBeverage) || 500,
      rewardTeaLabel: rewards.teaLabel || "Free Masala Chai (next visit)",
      rewardBeverageLabel: rewards.beverageLabel || "Free Beverage (next visit)",
    },
    counts,
    primaryOwner,
    platformAdmin,
    staff,
    menu: normalizeMenu(raw.menu),
  };
}

module.exports = { loadRestaurantConfig, slugify, resolveConfigPath };

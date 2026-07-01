/**
 * Deployment config loader — single restaurant OR multi-restaurant tenant bundle.
 *
 * Resolution order:
 *   1. process.env.RESTAURANT_CONFIG
 *   2. restaurant.config.json
 *   3. restaurant.config.example.json
 *
 * Formats:
 *   - Legacy single: { restaurant, staff, menu, platformAdmin, app }
 *   - Multi-tenant:  { tenant, restaurants: [...], platformAdmin, app }
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
    "No restaurant config found. Copy examples/tenant-single.config.json or run npm run setup.",
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

function normalizeRestaurantEntry(raw, { tenantSlug, app }) {
  const restaurant = raw.restaurant || raw;
  const name = restaurant.name || "My Restaurant";
  const slug = restaurant.slug || slugify(name);
  if (!slug) throw new Error("Each restaurant needs slug or name");

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
    throw new Error(`At least one owner required for restaurant ${slug}`);
  }

  const counts = {
    owner: staff.filter((s) => s.role === "OWNER").length,
    manager: staff.filter((s) => s.role === "MANAGER").length,
    cook: staff.filter((s) => s.role === "COOK").length,
    server: staff.filter((s) => s.role === "SERVER").length,
  };

  const rewards = restaurant.rewards || {};
  const branches = Array.isArray(raw.branches)
    ? raw.branches.map((b, i) => ({
        name: b.name || `Branch ${i + 1}`,
        slug: b.slug || slugify(b.name || `branch-${i + 1}`),
        address: b.address ?? null,
        isDefault: b.isDefault ?? i === 0,
        floors: Array.isArray(b.floors)
          ? b.floors.map((f, j) => ({
              name: f.name || `Floor ${j + 1}`,
              slug: f.slug || slugify(f.name || `floor-${j + 1}`),
              isDefault: f.isDefault ?? j === 0,
            }))
          : [{ name: "Ground Floor", slug: "ground", isDefault: true }],
      }))
    : [
        {
          name: "Main",
          slug: "main",
          address: null,
          isDefault: true,
          floors: [{ name: "Ground Floor", slug: "ground", isDefault: true }],
        },
      ];

  return {
    name,
    slug,
    tenantSlug,
    logoUrl: restaurant.logoUrl ?? null,
    backgroundImageUrl: restaurant.backgroundImageUrl ?? null,
    tableCount: Number(restaurant.tableCount) > 0 ? Number(restaurant.tableCount) : 10,
    defaultMaxSessions:
      Number(restaurant.defaultMaxSessions) > 0 ? Number(restaurant.defaultMaxSessions) : 2,
    rewardThresholdTea: Number(rewards.thresholdTea) || 250,
    rewardThresholdBeverage: Number(rewards.thresholdBeverage) || 500,
    rewardTeaLabel: rewards.teaLabel || "Free Masala Chai (next visit)",
    rewardBeverageLabel: rewards.beverageLabel || "Free Beverage (next visit)",
    counts,
    primaryOwner: staff.find((s) => s.role === "OWNER"),
    staff,
    menu: normalizeMenu(raw.menu || []),
    branches,
    guestUrl: `${app.url.replace(/\/$/, "")}/order/${slug}/${slug}-table-1/check-in`,
  };
}

function loadDeploymentConfig() {
  const configPath = resolveConfigPath();
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (err) {
    throw new Error(`Failed to parse config at ${configPath}: ${err.message}`);
  }

  const app = {
    url: raw.app?.url || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    name: raw.app?.name || "TableTap",
  };

  const adminInput = raw.platformAdmin || {};
  const platformAdmin = {
    name: adminInput.name || "Platform Admin",
    email: (adminInput.email || "admin@tabletap.app").toLowerCase(),
    password: adminInput.password || "changeme123",
  };

  const isMulti = Array.isArray(raw.restaurants) && raw.restaurants.length > 0;

  if (isMulti) {
    const tenantRaw = raw.tenant || {};
    const tenantName = tenantRaw.name || "My Restaurant Group";
    const tenantSlug = tenantRaw.slug || slugify(tenantName);
    const restaurants = raw.restaurants.map((r) =>
      normalizeRestaurantEntry(r, { tenantSlug, app }),
    );

    return {
      configPath,
      mode: "tenant",
      app,
      platformAdmin,
      tenant: {
        name: tenantName,
        slug: tenantSlug,
        plan: tenantRaw.plan || "STARTER",
        billingEmail: tenantRaw.billingEmail || platformAdmin.email,
      },
      restaurants,
      primaryOwner: restaurants[0]?.primaryOwner,
      restaurant: restaurants[0],
    };
  }

  const restaurant = normalizeRestaurantEntry(
    { restaurant: raw.restaurant, staff: raw.staff, menu: raw.menu, branches: raw.branches },
    { tenantSlug: raw.tenant?.slug || slugify(raw.restaurant?.name), app },
  );

  const tenantRaw = raw.tenant || {};
  const tenantName = tenantRaw.name || restaurant.name;
  const tenantSlug = tenantRaw.slug || restaurant.slug;

  return {
    configPath,
    mode: "single",
    app,
    platformAdmin,
    tenant: {
      name: tenantName,
      slug: tenantSlug,
      plan: tenantRaw.plan || "STARTER",
      billingEmail: tenantRaw.billingEmail || restaurant.primaryOwner?.email,
    },
    restaurants: [restaurant],
    primaryOwner: restaurant.primaryOwner,
    restaurant,
  };
}

/** Backward-compatible: first restaurant + legacy shape */
function loadRestaurantConfig() {
  const deployment = loadDeploymentConfig();
  return {
    configPath: deployment.configPath,
    app: deployment.app,
    restaurant: {
      name: deployment.restaurant.name,
      slug: deployment.restaurant.slug,
      logoUrl: deployment.restaurant.logoUrl,
      backgroundImageUrl: deployment.restaurant.backgroundImageUrl,
      tableCount: deployment.restaurant.tableCount,
      defaultMaxSessions: deployment.restaurant.defaultMaxSessions,
      rewardThresholdTea: deployment.restaurant.rewardThresholdTea,
      rewardThresholdBeverage: deployment.restaurant.rewardThresholdBeverage,
      rewardTeaLabel: deployment.restaurant.rewardTeaLabel,
      rewardBeverageLabel: deployment.restaurant.rewardBeverageLabel,
    },
    counts: deployment.restaurant.counts,
    primaryOwner: deployment.primaryOwner,
    platformAdmin: deployment.platformAdmin,
    staff: deployment.restaurant.staff,
    menu: deployment.restaurant.menu,
    tenant: deployment.tenant,
    mode: deployment.mode,
    restaurants: deployment.restaurants,
  };
}

module.exports = {
  loadRestaurantConfig,
  loadDeploymentConfig,
  slugify,
  resolveConfigPath,
  normalizeMenu,
  normalizeRestaurantEntry,
};

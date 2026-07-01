#!/usr/bin/env node
/** Generate example tenant configs (1–4 restaurants). Run: node scripts/generate-example-configs.mjs */
import fs from "node:fs";
import path from "node:path";
import { MINIMAL_DEMO_MENU, defaultStaffBlock } from "./config-menu-snippet.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const { loadDeploymentConfig, normalizeRestaurantEntry } = await import("./restaurant-config.js");

function restaurant(name, slug, tableCount, domain) {
  return {
    name,
    slug,
    tableCount,
    defaultMaxSessions: 2,
    staff: defaultStaffBlock(domain, "admin123", slug),
    menu: MINIMAL_DEMO_MENU,
    branches: [
      {
        name: "Main",
        slug: "main",
        isDefault: true,
        floors: [{ name: "Ground Floor", slug: "ground", isDefault: true }],
      },
    ],
  };
}

const presets = {
  "tenant-single": {
    app: { name: "TableTap Demo", url: "http://localhost:3000" },
    tenant: { name: "Dvadtech Group", slug: "dvadtech-group", plan: "STARTER", billingEmail: "billing@dvadtech.com" },
    platformAdmin: { name: "Platform Admin", email: "admin@dvadtech.com", password: "admin@dvadtech" },
    restaurants: [restaurant("Dvadtech Restaurant", "dvadtech", 10, "dvadtech.com")],
  },
  "tenant-dual": {
    app: { name: "TableTap Multi", url: "http://localhost:3000" },
    tenant: { name: "Twin Eats Group", slug: "twineats", plan: "PRO", billingEmail: "billing@twineats.com" },
    platformAdmin: { name: "Platform Admin", email: "admin@twineats.com", password: "admin123" },
    restaurants: [
      restaurant("PistaHouse Downtown", "pistahouse-dt", 12, "pistahouse.com"),
      restaurant("PistaHouse Airport", "pistahouse-ap", 8, "pistahouse.com"),
    ],
  },
  "tenant-triple": {
    app: { name: "TableTap Multi", url: "http://localhost:3000" },
    tenant: { name: "South Spice Collective", slug: "southspice", plan: "PRO", billingEmail: "billing@southspice.com" },
    platformAdmin: { name: "Platform Admin", email: "admin@southspice.com", password: "admin123" },
    restaurants: [
      restaurant("Charminar Biryani", "charminar", 10, "southspice.com"),
      restaurant("Coastal Kitchen", "coastal", 8, "southspice.com"),
      restaurant("Filter Coffee Bar", "filtercoffee", 6, "southspice.com"),
    ],
  },
  "tenant-quad": {
    app: { name: "TableTap Enterprise", url: "http://localhost:3000" },
    tenant: { name: "FoodPark India", slug: "foodpark", plan: "ENTERPRISE", billingEmail: "billing@foodpark.in" },
    platformAdmin: { name: "Platform Admin", email: "admin@foodpark.in", password: "admin123" },
    restaurants: [
      restaurant("FoodPark North", "fp-north", 10, "foodpark.in"),
      restaurant("FoodPark South", "fp-south", 10, "foodpark.in"),
      restaurant("FoodPark East", "fp-east", 8, "foodpark.in"),
      restaurant("FoodPark West", "fp-west", 8, "foodpark.in"),
    ],
  },
};

for (const [filename, body] of Object.entries(presets)) {
  const out = path.join(ROOT, "examples", `${filename}.config.json`);
  fs.writeFileSync(out, JSON.stringify(body, null, 2) + "\n");
  console.log("Wrote", out);
}

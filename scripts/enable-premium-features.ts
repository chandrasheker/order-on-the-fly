import "dotenv/config";
import { createPrismaClient } from "../src/lib/create-prisma-client";
import { FEATURE_CATALOG } from "../src/lib/feature-catalog";
import { updateRestaurantFeatureFlags } from "../src/lib/feature-flags";

const args = process.argv.slice(2);
function arg(name: string) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
}

const slug = arg("slug");
const all = args.includes("--all");
const featuresArg = arg("features");

async function main() {
  if (!slug) {
    console.error("Usage: --slug <restaurant-slug> (--all | --features kds,split_bill,...)");
    process.exit(1);
  }

  const prisma = createPrismaClient();
  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    console.error(`Restaurant not found: ${slug}`);
    process.exit(1);
  }

  const premiumKeys = FEATURE_CATALOG.filter((f) => f.tier === "premium" || f.tier === "roadmap").map(
    (f) => f.key
  );
  const selected: Record<string, boolean> = all
    ? Object.fromEntries(premiumKeys.map((k) => [k, true]))
    : Object.fromEntries(
        (featuresArg ?? "")
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean)
          .map((k) => [k, true])
      );

  if (Object.keys(selected).length === 0) {
    console.error("No features selected. Use --all or --features kds,floor_plan,...");
    process.exit(1);
  }

  const flags = await updateRestaurantFeatureFlags(restaurant.id, selected);
  console.log(`✅ Updated premium features for ${restaurant.name} (${slug}):`);
  for (const key of Object.keys(selected)) {
    console.log(`   ${key}: ${flags[key as keyof typeof flags] ? "ON" : "OFF"}`);
  }
  console.log("Changes apply within ~10 seconds — no restart needed.");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

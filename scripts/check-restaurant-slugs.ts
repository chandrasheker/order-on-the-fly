/**
 * Report restaurant slugs that cannot be used as DNS subdomains.
 * Does not rename anything — owners must choose a new slug explicitly.
 *
 *   npx tsx scripts/check-restaurant-slugs.ts
 */
import { restaurantSlugValidationError } from "../src/lib/restaurant-slug";
import { createPrismaClient } from "../src/lib/create-prisma-client";

async function main() {
  const prisma = createPrismaClient();
  const restaurants = await prisma.restaurant.findMany({
    select: { id: true, name: true, slug: true, isEnabled: true },
    orderBy: { slug: "asc" },
  });

  const invalid = restaurants.filter((row) => restaurantSlugValidationError(row.slug));
  if (invalid.length === 0) {
    console.log(`All ${restaurants.length} restaurant slug(s) are valid DNS subdomains.`);
    return;
  }

  console.error(`${invalid.length} restaurant slug(s) cannot be used as subdomains:`);
  for (const row of invalid) {
    console.error(`  - ${row.slug} (${row.name}, ${row.id}): ${restaurantSlugValidationError(row.slug)}`);
  }
  console.error("Do not auto-rename. Update each slug through a planned migration.");
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

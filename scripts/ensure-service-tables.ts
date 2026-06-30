import "dotenv/config";
import { createPrismaClient } from "../src/lib/create-prisma-client";
import { ensureServiceTables } from "../src/lib/service-tables";

async function main() {
  const prisma = createPrismaClient();
  const restaurants = await prisma.restaurant.findMany({ select: { id: true, slug: true, name: true } });

  for (const restaurant of restaurants) {
    await ensureServiceTables(restaurant.id, restaurant.slug);
    console.log(`✅ Service tables ready for ${restaurant.name}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

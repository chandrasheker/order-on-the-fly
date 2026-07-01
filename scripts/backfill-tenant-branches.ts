/**
 * Backfill Tenant + default Branch for existing restaurants.
 * Run after platform_roadmap_phases migration: npx tsx scripts/backfill-tenant-branches.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const restaurants = await prisma.restaurant.findMany({
    select: { id: true, name: true, slug: true, tenantId: true },
  });

  for (const r of restaurants) {
    let tenantId = r.tenantId;
    if (!tenantId) {
      const tenant = await prisma.tenant.create({
        data: {
          name: r.name,
          slug: r.slug,
          plan: "STARTER",
          subscriptionStatus: "TRIAL",
          subscriptions: {
            create: {
              plan: "STARTER",
              status: "TRIAL",
              currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
            },
          },
        },
      });
      tenantId = tenant.id;
      await prisma.restaurant.update({
        where: { id: r.id },
        data: { tenantId },
      });
      console.log(`Tenant created for ${r.slug}`);
    }

    let branch = await prisma.branch.findFirst({
      where: { restaurantId: r.id, isDefault: true },
    });
    if (!branch) {
      branch = await prisma.branch.create({
        data: {
          restaurantId: r.id,
          name: "Main",
          slug: "main",
          isDefault: true,
        },
      });
      console.log(`Default branch created for ${r.slug}`);
    }

    await prisma.table.updateMany({
      where: { restaurantId: r.id, branchId: null },
      data: { branchId: branch.id },
    });
    await prisma.order.updateMany({
      where: { restaurantId: r.id, branchId: null },
      data: { branchId: branch.id },
    });
    await prisma.kitchenStation.updateMany({
      where: { restaurantId: r.id, branchId: null },
      data: { branchId: branch.id },
    });
    await prisma.reservation.updateMany({
      where: { restaurantId: r.id, branchId: null },
      data: { branchId: branch.id },
    });
    await prisma.shiftClock.updateMany({
      where: { restaurantId: r.id, branchId: null },
      data: { branchId: branch.id },
    });
  }

  console.log("Backfill complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

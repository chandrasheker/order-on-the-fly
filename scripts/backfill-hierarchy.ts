/**
 * Backfill Tenant → Branch → Floor hierarchy and stamp tenantId on operational rows.
 */
import { prisma } from "../src/lib/prisma";
import { ensureDefaultBranch } from "../src/lib/branch-service";
import { ensureDefaultFloor } from "../src/domains/tables/floor-hierarchy";
import { ensureTenantForRestaurant } from "../src/lib/tenant-service";

async function main() {
  const restaurants = await prisma.restaurant.findMany({
    select: { id: true, slug: true, tenantId: true },
  });

  for (const r of restaurants) {
    const tenant = await ensureTenantForRestaurant(r.id);
    const tenantId = tenant!.id;

    await prisma.restaurant.update({
      where: { id: r.id },
      data: { tenantId },
    });

    const branch = await ensureDefaultBranch(r.id);
    await prisma.branch.updateMany({
      where: { restaurantId: r.id, tenantId: null },
      data: { tenantId },
    });

    const floor = await ensureDefaultFloor(branch.id, r.id);

    await prisma.table.updateMany({
      where: { restaurantId: r.id, tenantId: null },
      data: { tenantId, branchId: branch.id, floorId: floor.id },
    });

    await prisma.user.updateMany({
      where: { restaurantId: r.id, tenantId: null },
      data: { tenantId, branchId: branch.id },
    });

    await prisma.order.updateMany({
      where: { restaurantId: r.id, tenantId: null },
      data: { tenantId, branchId: branch.id, floorId: floor.id },
    });

    await prisma.payment.updateMany({
      where: { restaurantId: r.id, tenantId: null },
      data: { tenantId, branchId: branch.id },
    });

    await prisma.alert.updateMany({
      where: { restaurantId: r.id, tenantId: null },
      data: { tenantId, branchId: branch.id },
    });

    console.log(`Hierarchy backfill complete for ${r.slug} (tenant=${tenantId}, floor=${floor.slug})`);
  }

  console.log("All hierarchy backfills complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

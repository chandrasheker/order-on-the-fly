/**
 * List restaurant slugs and whether they can resolve as {slug}.{TENANT_BASE_DOMAIN}.
 *
 *   npm run hosts:list
 */
import "dotenv/config";
import { createPrismaClient } from "../src/lib/create-prisma-client";
import { getTenantBaseDomain, isValidRestaurantSubdomainSlug } from "../src/platform/host";

async function main() {
  const prisma = createPrismaClient();
  const base = getTenantBaseDomain();
  const restaurants = await prisma.restaurant.findMany({
    select: {
      slug: true,
      name: true,
      isEnabled: true,
      tenantId: true,
      tenant: { select: { slug: true, isEnabled: true } },
    },
    orderBy: { slug: "asc" },
  });

  console.log(`TENANT_BASE_DOMAIN=${base || "(unset)"}`);
  console.log(`TENANT_APEX_RESTAURANT=${process.env.TENANT_APEX_RESTAURANT === "1" ? "1" : "0"}`);
  console.log("");

  if (restaurants.length === 0) {
    console.log("No restaurants in the database.");
    return;
  }

  for (const row of restaurants) {
    const dnsOk = isValidRestaurantSubdomainSlug(row.slug);
    const hierarchyOk = Boolean(row.tenantId && row.tenant);
    const enabled = row.isEnabled && (row.tenant?.isEnabled ?? false);
    const host = base && dnsOk ? `${row.slug}.${base}` : "(invalid slug or missing TENANT_BASE_DOMAIN)";
    const status = !dnsOk
      ? "INVALID_SLUG"
      : !hierarchyOk
        ? "INVALID_HIERARCHY"
        : !enabled
          ? "DISABLED"
          : "OK";
    console.log(
      `${status.padEnd(18)} ${row.slug.padEnd(20)} host=${host} tenant=${row.tenant?.slug ?? "none"}`,
    );
  }

  console.log("");
  console.log("Unknown example hosts such as abc.dvadtech.in 404 unless that slug exists above.");
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

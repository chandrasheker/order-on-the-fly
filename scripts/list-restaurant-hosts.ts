/**
 * List restaurant slugs with canonical OOF hosts and legacy compatibility hosts.
 *
 *   npm run hosts:list
 */
import "dotenv/config";
import { createPrismaClient } from "../src/lib/create-prisma-client";
import {
  getOofBaseDomain,
  getTenantBaseDomain,
  isValidRestaurantSubdomainSlug,
} from "../src/platform/host";

async function main() {
  const prisma = createPrismaClient();
  const tenantBase = getTenantBaseDomain();
  const oofBase = getOofBaseDomain(tenantBase);
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

  console.log(`TENANT_BASE_DOMAIN=${tenantBase || "(unset)"}`);
  console.log(`OOF_BASE_DOMAIN=${oofBase || "(unset)"}`);
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
    const canonical = oofBase && dnsOk ? `${row.slug}.${oofBase}` : "(invalid slug or missing OOF_BASE_DOMAIN)";
    const legacy =
      tenantBase && dnsOk ? `${row.slug}.${tenantBase}` : "(invalid slug or missing TENANT_BASE_DOMAIN)";
    const status = !dnsOk
      ? "INVALID_SLUG"
      : !hierarchyOk
        ? "INVALID_HIERARCHY"
        : !enabled
          ? "DISABLED"
          : "OK";
    console.log(
      [
        status.padEnd(18),
        row.slug.padEnd(20),
        `canonical=${canonical}`,
        `legacy=${legacy}`,
        `tenant=${row.tenant?.slug ?? "none"}`,
        `hierarchy=${hierarchyOk ? "valid" : "invalid"}`,
      ].join(" "),
    );
  }

  console.log("");
  console.log("Canonical OOF host example: abc.oof.dvadtech.in");
  console.log("Legacy compatibility host example: abc.dvadtech.in");
  console.log("Both forms resolve the same HostSlug during migration. Unknown hosts 404.");
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

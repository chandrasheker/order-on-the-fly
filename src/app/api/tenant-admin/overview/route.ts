import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/auth";
import { getTenantOverview } from "@/lib/tenant-onboarding-service";
import { getRestaurantPublicBaseUrl, getTenantHubPublicBaseUrl } from "@/lib/server-app-url";

export async function GET() {
  const auth = await requireTenantAdmin();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const overview = await getTenantOverview(auth.session.tenantId);
  if (!overview || overview.tenant.id !== auth.session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    tenant: {
      ...overview.tenant,
      url: overview.tenant.hubActive ? getTenantHubPublicBaseUrl(overview.tenant.slug) : null,
    },
    restaurants: overview.restaurants.map((restaurant) => ({
      ...restaurant,
      url: getRestaurantPublicBaseUrl(restaurant.slug),
    })),
    stats: overview.stats,
  });
}

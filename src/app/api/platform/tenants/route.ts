import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  listTenantsWithRestaurants,
  addRestaurantToTenant,
  addBranchToRestaurant,
} from "@/lib/tenant-onboarding-service";
import {
  endStaffSessionsForRestaurant,
  endStaffSessionsForTenant,
} from "@/lib/staff-session-service";
import { getRestaurantPublicBaseUrl, publicRestaurantPayload } from "@/lib/server-app-url";
import { getTenantBaseDomain } from "@/platform/host";
import { invalidateHostTenantCache, invalidateHostTenantCacheForSlugs } from "@/platform/host-tenant";

export async function GET() {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenants = await listTenantsWithRestaurants();
  return NextResponse.json({
    tenantBaseDomain: getTenantBaseDomain(),
    tenants: tenants.map((tenant) => ({
      ...tenant,
      restaurants: tenant.restaurants.map((restaurant) => ({
        ...restaurant,
        url: getRestaurantPublicBaseUrl(restaurant.slug),
      })),
    })),
  });
}

export async function POST(req: NextRequest) {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const action = String(body.action ?? "add_restaurant");

  try {
    if (action === "add_restaurant") {
      const tenantId = String(body.tenantId ?? "");
      const result = await addRestaurantToTenant(tenantId, {
        name: String(body.name ?? ""),
        slug: body.slug ? String(body.slug) : undefined,
        tableCount: body.tableCount ? Number(body.tableCount) : undefined,
        ownerEmail: String(body.ownerEmail ?? "").toLowerCase(),
        ownerName: String(body.ownerName ?? "Owner"),
        ownerPassword: body.ownerPassword ? String(body.ownerPassword) : undefined,
      });
      return NextResponse.json(
        { ok: true, restaurant: publicRestaurantPayload(result.restaurant) },
        { status: 201 },
      );
    }

    if (action === "add_branch") {
      const restaurantId = String(body.restaurantId ?? "");
      const branch = await addBranchToRestaurant(restaurantId, {
        name: String(body.name ?? ""),
        slug: body.slug ? String(body.slug) : undefined,
        address: body.address ? String(body.address) : undefined,
      });
      return NextResponse.json({ ok: true, branch }, { status: 201 });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const action = String(body.action ?? "");

  try {
    if (action === "set_tenant_enabled") {
      const tenantId = String(body.tenantId ?? "");
      const isEnabled = Boolean(body.isEnabled);
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { restaurants: { select: { slug: true } } },
      });
      if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

      await prisma.tenant.update({ where: { id: tenantId }, data: { isEnabled } });
      if (!isEnabled) await endStaffSessionsForTenant(tenantId);
      invalidateHostTenantCacheForSlugs(tenant.restaurants.map((restaurant) => restaurant.slug));

      return NextResponse.json({ ok: true, tenant: { id: tenantId, isEnabled } });
    }

    if (action === "set_restaurant_enabled") {
      const restaurantId = String(body.restaurantId ?? "");
      const isEnabled = Boolean(body.isEnabled);
      const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
      if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

      await prisma.restaurant.update({ where: { id: restaurantId }, data: { isEnabled } });
      if (!isEnabled) await endStaffSessionsForRestaurant(restaurantId);
      invalidateHostTenantCache(restaurant.slug);

      return NextResponse.json({ ok: true, restaurant: { id: restaurantId, isEnabled } });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  listTenantsWithRestaurants,
  addRestaurantToTenant,
  addBranchToRestaurant,
  signupTenantWithRestaurants,
  renameTenant,
  renameRestaurant,
} from "@/lib/tenant-onboarding-service";
import { tenantHubIsActive } from "@/lib/hostname-rules";
import {
  setTenantEnabled,
  setRestaurantEnabled,
  deleteTenantEverywhere,
  deleteRestaurantEverywhere,
} from "@/lib/tenant-lifecycle";
import {
  getRestaurantPublicBaseUrl,
  getTenantHubPublicBaseUrl,
  publicRestaurantPayload,
} from "@/lib/server-app-url";
import { getTenantBaseDomain } from "@/platform/host";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET() {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenants = await listTenantsWithRestaurants();
  return NextResponse.json({
    tenantBaseDomain: getTenantBaseDomain(),
    tenants: tenants.map((tenant) => {
      const hubActive = tenantHubIsActive({
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        restaurants: tenant.restaurants,
      });
      return {
        ...tenant,
        hubActive,
        url: hubActive ? getTenantHubPublicBaseUrl(tenant.slug) : null,
        restaurants: tenant.restaurants.map((restaurant) => ({
          ...restaurant,
          url: getRestaurantPublicBaseUrl(restaurant.slug),
        })),
      };
    }),
  });
}

export const GET = withForensicApiRoute(handleGET);

async function handlePOST(req: NextRequest) {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const action = String(body.action ?? "add_restaurant");

  try {
    if (action === "create_tenant") {
      const restaurants = Array.isArray(body.restaurants) ? body.restaurants : [];
      const result = await signupTenantWithRestaurants({
        tenantName: String(body.tenantName ?? ""),
        tenantSlug: body.tenantSlug ? String(body.tenantSlug) : undefined,
        billingEmail: String(body.billingEmail ?? "").toLowerCase(),
        plan: body.plan,
        restaurants: restaurants.map((restaurant: Record<string, unknown>) => ({
          name: String(restaurant.name ?? ""),
          slug: restaurant.slug ? String(restaurant.slug) : undefined,
          tableCount: restaurant.tableCount ? Number(restaurant.tableCount) : undefined,
          ownerEmail: String(restaurant.ownerEmail ?? "").toLowerCase(),
          ownerName: String(restaurant.ownerName ?? "Owner"),
          ownerPassword: String(restaurant.ownerPassword ?? ""),
        })),
      });
      const hubActive = tenantHubIsActive({
        tenantSlug: result.tenant.slug,
        tenantName: result.tenant.name,
        restaurants: result.restaurants.map((row) => row.restaurant),
      });
      return NextResponse.json(
        {
          ok: true,
          tenant: {
            id: result.tenant.id,
            name: result.tenant.name,
            slug: result.tenant.slug,
            url: hubActive ? getTenantHubPublicBaseUrl(result.tenant.slug) : null,
          },
          restaurants: result.restaurants.map((row) => publicRestaurantPayload(row.restaurant)),
        },
        { status: 201 },
      );
    }

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

export const POST = withForensicApiRoute(handlePOST);

async function handlePATCH(req: NextRequest) {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const action = String(body.action ?? "");

  try {
    if (action === "set_tenant_enabled") {
      const tenantId = String(body.tenantId ?? "");
      const isEnabled = Boolean(body.isEnabled);
      const tenant = await setTenantEnabled(tenantId, isEnabled);
      return NextResponse.json({ ok: true, tenant });
    }

    if (action === "set_restaurant_enabled") {
      const restaurantId = String(body.restaurantId ?? "");
      const isEnabled = Boolean(body.isEnabled);
      await setRestaurantEnabled(restaurantId, isEnabled);
      return NextResponse.json({ ok: true, restaurant: { id: restaurantId, isEnabled } });
    }

    if (action === "delete_tenant") {
      const tenantId = String(body.tenantId ?? "");
      const result = await deleteTenantEverywhere(tenantId);
      return NextResponse.json({ ok: true, deleted: result });
    }

    if (action === "rename_tenant") {
      const result = await renameTenant(String(body.tenantId ?? ""), String(body.name ?? ""));
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "rename_restaurant") {
      const result = await renameRestaurant(String(body.restaurantId ?? ""), String(body.name ?? ""));
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "delete_restaurant") {
      const restaurantId = String(body.restaurantId ?? "");
      const result = await deleteRestaurantEverywhere(restaurantId);
      return NextResponse.json({ ok: true, deleted: result });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    const status = /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export const PATCH = withForensicApiRoute(handlePATCH);

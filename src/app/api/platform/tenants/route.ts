import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  listTenantsWithRestaurants,
  addRestaurantToTenant,
  addBranchToRestaurant,
} from "@/lib/tenant-onboarding-service";

export async function GET() {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenants = await listTenantsWithRestaurants();
  return NextResponse.json({ tenants });
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
      return NextResponse.json({ ok: true, restaurant: result.restaurant }, { status: 201 });
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

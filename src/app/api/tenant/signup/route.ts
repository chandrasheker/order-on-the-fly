import { NextRequest, NextResponse } from "next/server";
import { signupTenantWithRestaurant } from "@/lib/tenant-onboarding-service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await signupTenantWithRestaurant({
      tenantName: String(body.tenantName ?? "").trim(),
      tenantSlug: body.tenantSlug ? String(body.tenantSlug).trim() : undefined,
      billingEmail: String(body.billingEmail ?? "").trim().toLowerCase(),
      plan: body.plan,
      restaurantName: String(body.restaurantName ?? "").trim(),
      restaurantSlug: body.restaurantSlug ? String(body.restaurantSlug).trim() : undefined,
      ownerName: String(body.ownerName ?? "").trim(),
      ownerEmail: String(body.ownerEmail ?? "").trim().toLowerCase(),
      ownerPassword: String(body.ownerPassword ?? ""),
      tableCount: body.tableCount ? Number(body.tableCount) : undefined,
    });

    return NextResponse.json(
      {
        ok: true,
        tenant: { id: result.tenant.id, slug: result.tenant.slug, name: result.tenant.name },
        restaurant: { id: result.restaurant.id, slug: result.restaurant.slug, name: result.restaurant.name },
        ownerLogin: result.owner.email,
        guestUrl: `/order/${result.restaurant.slug}/${result.restaurant.slug}-table-1/check-in`,
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signup failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

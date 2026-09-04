import { NextRequest, NextResponse } from "next/server";
import { signupTenantWithRestaurant } from "@/lib/tenant-onboarding-service";
import { getTableCheckInUrl, publicRestaurantPayload } from "@/lib/server-app-url";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handlePOST(req: NextRequest) {
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

    const restaurant = publicRestaurantPayload(result.restaurant);
    return NextResponse.json(
      {
        ok: true,
        tenant: { id: result.tenant.id, slug: result.tenant.slug, name: result.tenant.name },
        restaurant,
        restaurantUrl: restaurant.url,
        ownerLogin: result.owner.email,
        guestUrl: getTableCheckInUrl(result.restaurant.slug, `${result.restaurant.slug}-table-1`),
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signup failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const POST = withForensicApiRoute(handlePOST);

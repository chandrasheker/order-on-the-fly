import { NextRequest, NextResponse } from "next/server";
import { MENU_MEDIA_CONTENT_TYPE } from "@/lib/menu-media/constants";
import { loadPublicMenuItemImage } from "@/lib/menu-media/service";
import { resolveTenantFromHost } from "@/platform/host-tenant";
import { opaqueNotFoundJson, publicCustomerHostScope } from "@/platform/tenant-scope";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params;
  const resolution = await resolveTenantFromHost(req);
  const scope = publicCustomerHostScope(resolution);
  if (!scope.ok) {
    return opaqueNotFoundJson();
  }

  const bytes = await loadPublicMenuItemImage({
    itemId,
    restaurantId: scope.restaurantId,
    requireRestaurant: scope.requireRestaurant,
  });
  if (!bytes) {
    return opaqueNotFoundJson();
  }

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": MENU_MEDIA_CONTENT_TYPE,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

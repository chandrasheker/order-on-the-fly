import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey, requireScope } from "@/lib/api-key-service";
import { prisma } from "@/lib/prisma";
import { hostRestaurantId, opaqueNotFoundJson, resolveRequestRestaurant, restaurantOpsAllowedOnResolution } from "@/platform/tenant-scope";

async function assertApiKeyMatchesHost(req: NextRequest, restaurantId: string) {
  const resolution = await resolveRequestRestaurant(req);
  if (!resolution.ok || !restaurantOpsAllowedOnResolution(resolution)) return opaqueNotFoundJson();
  const hostId = hostRestaurantId(resolution);
  if (hostId && hostId !== restaurantId) return opaqueNotFoundJson();
  return null;
}

async function authRequest(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : req.headers.get("x-api-key");
  if (!token) return null;
  return verifyApiKey(token);
}

export async function GET(req: NextRequest) {
  const auth = await authRequest(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!requireScope(auth.scopes, "menu:read")) {
    return NextResponse.json({ error: "Insufficient scope" }, { status: 403 });
  }

  const hostBlocked = await assertApiKeyMatchesHost(req, auth.restaurantId);
  if (hostBlocked) return hostBlocked;

  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId: auth.restaurantId, isEnabled: true },
    include: {
      items: {
        where: { isAvailable: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          prepTimeMinutes: true,
          isVeg: true,
          isSpicy: true,
        },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({ categories });
}

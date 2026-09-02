import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey, requireScope } from "@/lib/api-key-service";
import { prisma } from "@/lib/prisma";
import { todayDateString } from "@/lib/utils";
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
  if (!requireScope(auth.scopes, "orders:read")) {
    return NextResponse.json({ error: "Insufficient scope" }, { status: 403 });
  }

  const hostBlocked = await assertApiKeyMatchesHost(req, auth.restaurantId);
  if (hostBlocked) return hostBlocked;

  const orders = await prisma.order.findMany({
    where: { restaurantId: auth.restaurantId, date: todayDateString() },
    include: { table: true, items: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ orders });
}

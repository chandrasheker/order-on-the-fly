import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { canAccessAdminMenu } from "@/lib/staff-permissions";
import { featureDisabledResponse } from "@/lib/feature-guard";
import {
  getAggregatorConnectionsForRestaurant,
  saveAggregatorCredentials,
  testAggregatorConnection,
} from "@/lib/aggregator-connection-service";
import type { AggregatorPlatform } from "@/generated/prisma/client";

export async function GET() {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session || !canAccessAdminMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "aggregator_inbox");
  if (blocked) return blocked;

  const connections = await getAggregatorConnectionsForRestaurant(
    session.restaurantId,
    session.restaurantSlug
  );

  return NextResponse.json({
    connections,
    setupGuide: "/AGGREGATOR_SETUP.md",
    requirements: {
      zomato: [
        "Outlet ID from Zomato Partner dashboard",
        "API key from Zomato POS Integration program",
        "Register TableTap webhook URL with your Zomato POC",
      ],
      swiggy: [
        "Outlet / restaurant ID from Swiggy Partner dashboard",
        "API key from Swiggy POS integration team",
        "Register TableTap webhook URL with Swiggy partner support",
      ],
    },
  });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session || !canAccessAdminMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "aggregator_inbox");
  if (blocked) return blocked;

  const body = await req.json();
  const platform = String(body.platform ?? "").toUpperCase() as AggregatorPlatform;
  if (platform !== "SWIGGY" && platform !== "ZOMATO") {
    return NextResponse.json({ error: "platform must be SWIGGY or ZOMATO" }, { status: 400 });
  }

  const outletId = String(body.outletId ?? "").trim();
  if (!outletId) {
    return NextResponse.json({ error: "outletId is required" }, { status: 400 });
  }

  const saved = await saveAggregatorCredentials({
    restaurantId: session.restaurantId,
    slug: session.restaurantSlug,
    platform,
    outletId,
    apiKey: body.apiKey ? String(body.apiKey) : undefined,
    apiSecret: body.apiSecret ? String(body.apiSecret) : undefined,
    autoConfirm: body.autoConfirm !== undefined ? Boolean(body.autoConfirm) : undefined,
  });

  return NextResponse.json({
    ok: true,
    connection: saved,
    message:
      "Credentials saved. Give the webhook URL and secret to Zomato/Swiggy partner team to activate automatic order sync.",
  });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session || !canAccessAdminMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "aggregator_inbox");
  if (blocked) return blocked;

  const body = await req.json();
  const platform = String(body.platform ?? "").toUpperCase() as AggregatorPlatform;
  if (platform !== "SWIGGY" && platform !== "ZOMATO") {
    return NextResponse.json({ error: "platform must be SWIGGY or ZOMATO" }, { status: 400 });
  }

  const result = await testAggregatorConnection({
    restaurantId: session.restaurantId,
    platform,
  });

  return NextResponse.json(result);
}

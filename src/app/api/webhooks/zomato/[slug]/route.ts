import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  ingestPlatformOrder,
  verifyPlatformWebhook,
} from "@/lib/aggregator-connection-service";
import { OrderCreationError } from "@/lib/order-service";
import { logApiError, logApiRequest, logInfo } from "@/lib/logger";
import { rejectIfSlugEscapesHost } from "@/platform/tenant-scope";

async function handleWebhook(
  req: NextRequest,
  slug: string,
  platform: "SWIGGY" | "ZOMATO"
) {
  logApiRequest(`webhooks/${platform.toLowerCase()}`, "POST", { slug });

  const blocked = await rejectIfSlugEscapesHost(req, slug);
  if (blocked) return blocked;

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, slug: true },
  });
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  const enabled = await isFeatureEnabled(restaurant.id, "aggregator_inbox");
  if (!enabled) {
    return NextResponse.json({ error: "Aggregator inbox is not enabled" }, { status: 403 });
  }

  const connection = await prisma.aggregatorConnection.findUnique({
    where: { restaurantId_platform: { restaurantId: restaurant.id, platform } },
  });

  if (!connection?.webhookSecret && !connection?.apiKeyEnc) {
    return NextResponse.json(
      { error: "Aggregator not configured. Owner must save credentials in Admin → Integrations." },
      { status: 503 }
    );
  }

  const auth = req.headers.get("authorization");
  const apiKeyHeader = req.headers.get("x-api-key") ?? req.headers.get("x-zomato-api-key");
  if (
    !verifyPlatformWebhook(connection, {
      authorization: auth,
      apiKeyHeader,
    })
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  try {
    const result = await ingestPlatformOrder({
      restaurantId: restaurant.id,
      restaurantSlug: restaurant.slug,
      platform,
      body,
      connection,
    });

    if (result.duplicate) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        orderId: result.orderId,
        orderNumber: result.orderNumber,
      });
    }

    logInfo(`webhooks/${platform.toLowerCase()}`, "Order ingested automatically", {
      restaurantId: restaurant.id,
      orderId: result.order.id,
      externalOrderId: result.externalOrderId,
    });

    return NextResponse.json(
      {
        ok: true,
        orderId: result.order.id,
        orderNumber: result.order.orderNumber,
        total: result.total,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof OrderCreationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    logApiError(`webhooks/${platform.toLowerCase()}`, "POST", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  return handleWebhook(req, slug, "ZOMATO");
}

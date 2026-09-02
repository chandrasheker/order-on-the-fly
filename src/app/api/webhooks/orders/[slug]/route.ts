import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createChannelOrder,
  verifyAggregatorWebhookSecret,
} from "@/lib/aggregator-order-service";
import { OrderCreationError } from "@/lib/order-service";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { logApiError, logApiRequest, logInfo } from "@/lib/logger";
import type { OrderChannel } from "@/generated/prisma/client";
import { rejectIfSlugEscapesHost } from "@/platform/tenant-scope";

const CHANNELS: OrderChannel[] = ["SWIGGY", "ZOMATO", "TAKEAWAY", "DELIVERY"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  logApiRequest("webhooks/orders/[slug]", "POST", { slug });

  try {
    const blocked = await rejectIfSlugEscapesHost(req, slug);
    if (blocked) return blocked;

    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      select: { id: true, slug: true, aggregatorWebhookSecret: true },
    });
    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    const enabled = await isFeatureEnabled(restaurant.id, "aggregator_inbox");
    if (!enabled) {
      return NextResponse.json({ error: "Aggregator inbox is not enabled" }, { status: 403 });
    }

    const auth = req.headers.get("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : req.headers.get("x-tabletap-webhook-secret");
    if (!verifyAggregatorWebhookSecret(token, restaurant.aggregatorWebhookSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const channel = String(body.channel ?? "").toUpperCase() as OrderChannel;
    if (!CHANNELS.includes(channel)) {
      return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
    }

    const { order, total } = await createChannelOrder({
      restaurantId: restaurant.id,
      restaurantSlug: restaurant.slug,
      channel,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      externalOrderId: body.externalOrderId,
      orderNotes: body.orderNotes,
      items: body.items ?? [],
      placedByName: body.source ?? channel,
    });

    logInfo("webhooks/orders", "Webhook order ingested", {
      restaurantId: restaurant.id,
      orderId: order.id,
      channel,
      externalOrderId: body.externalOrderId,
    });

    return NextResponse.json(
      { ok: true, orderId: order.id, orderNumber: order.orderNumber, total },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof OrderCreationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    logApiError("webhooks/orders/[slug]", "POST", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

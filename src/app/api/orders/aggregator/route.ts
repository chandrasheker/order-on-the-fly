import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createChannelOrder } from "@/lib/aggregator-order-service";
import { OrderCreationError } from "@/lib/order-service";
import { ensureAggregatorWebhookSecret } from "@/lib/service-tables";
import { featureDisabledResponse } from "@/lib/feature-guard";
import { logApiError, logApiRequest, logInfo } from "@/lib/logger";
import { buildKitchenChitPayload } from "@/lib/kitchen-chit-service";
import type { OrderChannel } from "@/generated/prisma/client";

const CHANNELS: OrderChannel[] = ["SWIGGY", "ZOMATO", "TAKEAWAY", "DELIVERY"];

export async function POST(req: NextRequest) {
  logApiRequest("orders/aggregator", "POST");
  try {
    const session = await requireSession(["OWNER", "MANAGER", "SERVER"]);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const blocked = await featureDisabledResponse(session.restaurantId, "aggregator_inbox");
    if (blocked) return blocked;

    const body = await req.json();
    const channel = String(body.channel ?? "").toUpperCase() as OrderChannel;
    if (!CHANNELS.includes(channel)) {
      return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
    }

    const { order, total } = await createChannelOrder({
      restaurantId: session.restaurantId,
      restaurantSlug: session.restaurantSlug,
      channel,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      externalOrderId: body.externalOrderId,
      orderNotes: body.orderNotes,
      items: body.items ?? [],
      placedByUserId: session.id,
      placedByName: session.name,
    });

    const kitchenChit = await buildKitchenChitPayload(order.id);

    logInfo("api:orders/aggregator", "Aggregator/channel order created", {
      orderId: order.id,
      channel,
      orderNumber: order.orderNumber,
    });

    return NextResponse.json(
      { order: { ...order, total }, kitchenChit },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof OrderCreationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    logApiError("orders/aggregator", "POST", error);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}

export async function GET() {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "aggregator_inbox");
  if (blocked) return blocked;

  const secret = await ensureAggregatorWebhookSecret(session.restaurantId);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return NextResponse.json({
    webhookUrl: `${baseUrl}/api/webhooks/orders/${session.restaurantSlug}`,
    webhookSecret: secret,
    instructions:
      "POST JSON with Authorization: Bearer <webhookSecret>. Swiggy/Zomato partner APIs can push orders here; staff can also enter orders manually in the dashboard.",
    sampleBody: {
      channel: "SWIGGY",
      externalOrderId: "SW-123456",
      customerName: "Guest",
      customerPhone: "+919876543210",
      orderNotes: "Extra napkins",
      items: [{ itemName: "Masala Dosa", quantity: 2, notes: "Less oil" }],
    },
  });
}

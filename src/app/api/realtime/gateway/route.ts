import { NextRequest, NextResponse } from "next/server";
import { requireSession, canManageMenu } from "@/lib/auth";
import { featureDisabledResponse } from "@/lib/feature-guard";
import {
  getPaymentGatewaySettings,
  updatePaymentGatewaySettings,
} from "@/lib/payment-webhook-service";
import type { PaymentGatewayProvider } from "@/generated/prisma/client";

export async function GET() {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "payment_webhooks");
  if (blocked) return blocked;

  const settings = await getPaymentGatewaySettings(session.restaurantId);
  return NextResponse.json({ settings });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "payment_webhooks");
  if (blocked) return blocked;

  const body = await req.json();
  try {
    const settings = await updatePaymentGatewaySettings(session.restaurantId, {
      provider: (body.provider ?? null) as PaymentGatewayProvider | null,
      keyId: body.keyId ?? null,
      secret: body.secret ?? null,
      webhookSecret: body.webhookSecret ?? null,
    });
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed" },
      { status: 400 },
    );
  }
}

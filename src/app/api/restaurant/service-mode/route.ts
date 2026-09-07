import { NextRequest, NextResponse } from "next/server";
import { requireSession, canManageMenu } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";
import {
  DEFAULT_PICKUP_LOCATION_LABEL,
  PICKUP_LOCATION_MAX_LENGTH,
  isOrderFulfillmentMode,
  isRestaurantServiceMode,
} from "@/lib/fulfillment/constants";
import { publicServiceMode } from "@/lib/fulfillment/resolve";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/platform/forensics/constants";
import { appendPlatformAuditEventInTx } from "@/platform/forensics/platform-audit-service";

async function handleGET() {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: session.restaurantId },
    select: {
      serviceMode: true,
      pickupLocationLabel: true,
      hybridDefaultFulfillment: true,
    },
  });
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }
  return NextResponse.json({ settings: publicServiceMode(restaurant) });
}

export const GET = withForensicApiRoute(handleGET);

async function handlePATCH(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const serviceMode = body.serviceMode;
  const hybridDefaultFulfillment = body.hybridDefaultFulfillment;
  const pickupLocationLabel =
    body.pickupLocationLabel != null
      ? String(body.pickupLocationLabel).trim().slice(0, PICKUP_LOCATION_MAX_LENGTH) ||
        DEFAULT_PICKUP_LOCATION_LABEL
      : undefined;

  if (serviceMode != null && !isRestaurantServiceMode(serviceMode)) {
    return NextResponse.json({ error: "Invalid service mode" }, { status: 400 });
  }
  if (hybridDefaultFulfillment != null && !isOrderFulfillmentMode(hybridDefaultFulfillment)) {
    return NextResponse.json({ error: "Invalid hybrid default" }, { status: 400 });
  }

  const before = await prisma.restaurant.findUnique({
    where: { id: session.restaurantId },
    select: {
      serviceMode: true,
      pickupLocationLabel: true,
      hybridDefaultFulfillment: true,
    },
  });
  if (!before) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.restaurant.update({
      where: { id: session.restaurantId },
      data: {
        ...(serviceMode ? { serviceMode } : {}),
        ...(hybridDefaultFulfillment ? { hybridDefaultFulfillment } : {}),
        ...(pickupLocationLabel != null ? { pickupLocationLabel } : {}),
      },
      select: {
        serviceMode: true,
        pickupLocationLabel: true,
        hybridDefaultFulfillment: true,
      },
    });
    if (
      before.serviceMode !== next.serviceMode ||
      before.hybridDefaultFulfillment !== next.hybridDefaultFulfillment ||
      before.pickupLocationLabel !== next.pickupLocationLabel
    ) {
      await appendPlatformAuditEventInTx(tx, {
        category: AUDIT_CATEGORY.CONFIG,
        action: AUDIT_ACTION.RESTAURANT_SERVICE_MODE_CHANGED,
        restaurantId: session.restaurantId,
        resourceType: "Restaurant",
        resourceId: session.restaurantId,
        before: {
          serviceMode: before.serviceMode,
          hybridDefaultFulfillment: before.hybridDefaultFulfillment,
          pickupLocationLabel: before.pickupLocationLabel,
        },
        after: {
          serviceMode: next.serviceMode,
          hybridDefaultFulfillment: next.hybridDefaultFulfillment,
          pickupLocationLabel: next.pickupLocationLabel,
        },
        metadata: {
          restaurantId: session.restaurantId,
        },
      });
    }
    return next;
  });

  return NextResponse.json({ settings: publicServiceMode(updated) });
}

export const PATCH = withForensicApiRoute(handlePATCH);

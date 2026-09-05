import { NextRequest, NextResponse } from "next/server";
import { requireSession, canManageMenu } from "@/lib/auth";
import { featureDisabledResponse } from "@/lib/feature-guard";
import { prisma } from "@/lib/prisma";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET() {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "push_alerts");
  if (blocked) return blocked;

  const row = await prisma.restaurant.findUnique({
    where: { id: session.restaurantId },
    select: { pushAlertsEnabled: true, smsAlertsEnabled: true },
  });
  return NextResponse.json({ settings: row });
}

export const GET = withForensicApiRoute(handleGET);

async function handlePATCH(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "push_alerts");
  if (blocked) return blocked;

  const body = await req.json();
  const settings = await prisma.restaurant.update({
    where: { id: session.restaurantId },
    data: {
      ...(body.pushAlertsEnabled !== undefined
        ? { pushAlertsEnabled: Boolean(body.pushAlertsEnabled) }
        : {}),
      ...(body.smsAlertsEnabled !== undefined
        ? { smsAlertsEnabled: Boolean(body.smsAlertsEnabled) }
        : {}),
    },
    select: { pushAlertsEnabled: true, smsAlertsEnabled: true },
  });
  return NextResponse.json({ settings });
}

export const PATCH = withForensicApiRoute(handlePATCH);

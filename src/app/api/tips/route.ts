import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { canAccessAdminMenu } from "@/lib/staff-permissions";
import { featureDisabledResponse } from "@/lib/feature-guard";
import {
  computeTipPool,
  exportTipPoolPayout,
  listTipPayouts,
  defaultTipPeriod,
  applyOrderComp,
} from "@/lib/tip-pool-service";
import { recordAuditLog } from "@/lib/audit-service";

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canAccessAdminMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "tip_pooling");
  if (blocked) return blocked;

  const periodStart = req.nextUrl.searchParams.get("start") ?? defaultTipPeriod().start;
  const periodEnd = req.nextUrl.searchParams.get("end") ?? defaultTipPeriod().end;

  const [pool, payouts] = await Promise.all([
    computeTipPool(session.restaurantId, periodStart, periodEnd),
    listTipPayouts(session.restaurantId),
  ]);

  return NextResponse.json({ periodStart, periodEnd, pool, payouts });
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canAccessAdminMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "tip_pooling");
  if (blocked) return blocked;

  const body = await req.json();
  const action = String(body.action ?? "export");

  try {
    if (action === "comp") {
      const order = await applyOrderComp({
        orderId: String(body.orderId),
        discountAmount: Number(body.discountAmount ?? 0),
        compReason: String(body.compReason ?? ""),
        actorUserId: session.id,
        actorName: session.name,
      });
      await recordAuditLog({
        restaurantId: session.restaurantId,
        actionType: "COMP",
        entityId: order.id,
        reason: body.compReason ? String(body.compReason) : undefined,
        payload: { discountAmount: body.discountAmount },
        actorUserId: session.id,
        actorName: session.name,
      });
      return NextResponse.json({ ok: true, order });
    }

    const periodStart = String(body.periodStart ?? defaultTipPeriod().start);
    const periodEnd = String(body.periodEnd ?? defaultTipPeriod().end);
    const result = await exportTipPoolPayout({
      restaurantId: session.restaurantId,
      periodStart,
      periodEnd,
      createdByName: session.name,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Tip action failed" },
      { status: 400 }
    );
  }
}

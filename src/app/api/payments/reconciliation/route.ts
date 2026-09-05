import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";
import {
  listReconciliations,
  recordCashCount,
  runDailyReconciliation,
} from "@/domains/payments/reconciliation-service";

async function handleGET() {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await listReconciliations(session.restaurantId);
  return NextResponse.json({ reconciliations: rows });
}

export const GET = withForensicApiRoute(handleGET);

async function handlePOST(req: NextRequest) {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const date = body.date ? String(body.date) : undefined;
  if (typeof body.cashCounted === "number") {
    const row = await recordCashCount({
      restaurantId: session.restaurantId,
      periodDate: date,
      cashCounted: body.cashCounted,
    });
    return NextResponse.json({ reconciliation: row });
  }
  const row = await runDailyReconciliation(session.restaurantId, date);
  return NextResponse.json({ reconciliation: row });
}

export const POST = withForensicApiRoute(handlePOST);

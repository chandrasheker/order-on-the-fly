import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  listReconciliations,
  runDailyReconciliation,
} from "@/domains/payments/reconciliation-service";

export async function GET() {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await listReconciliations(session.restaurantId);
  return NextResponse.json({ reconciliations: rows });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const date = body.date ? String(body.date) : undefined;
  const row = await runDailyReconciliation(session.restaurantId, date);
  return NextResponse.json({ reconciliation: row });
}

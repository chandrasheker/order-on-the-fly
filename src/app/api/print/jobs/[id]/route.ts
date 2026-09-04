import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { reprintPrintJobForRestaurant, retryPrintJobForRestaurant } from "@/domains/printing/print-job-service";
import { opaqueNotFoundJson } from "@/platform/tenant-scope";
import { canPerformOrderAction } from "@/lib/staff-permissions";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handlePATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession(["OWNER", "MANAGER", "SERVER"]);
  if (!session || !canPerformOrderAction(session.role, "mark-paid")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "retry");

  if (action === "reprint") {
    const reprint = await reprintPrintJobForRestaurant({
      jobId: id,
      restaurantId: session.restaurantId,
      actorUserId: session.id,
      actorName: session.name,
    });
    if (!reprint) return opaqueNotFoundJson();
    return NextResponse.json({ success: true, job: { id: reprint.id, status: reprint.status } });
  }

  const retried = await retryPrintJobForRestaurant(id, session.restaurantId);
  if (!retried) return opaqueNotFoundJson();
  return NextResponse.json({ success: true, job: { id: retried.id, status: retried.status } });
}

export const PATCH = withForensicApiRoute(handlePATCH);

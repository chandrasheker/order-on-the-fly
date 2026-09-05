import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { listPrintJobs, printQueueSummary, publicPrintJob } from "@/domains/printing/print-job-service";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET(req: NextRequest) {
  const session = await requireSession(["OWNER", "MANAGER", "SERVER"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  const jobs = await listPrintJobs(session.restaurantId, Math.min(100, Math.max(1, limit)));
  const counts = await printQueueSummary(session.restaurantId);
  const pending = counts.pending + counts.sent + counts.failed;

  return NextResponse.json({
    jobs: jobs.map(publicPrintJob),
    pendingCount: pending,
    counts,
  });
}

export const GET = withForensicApiRoute(handleGET);

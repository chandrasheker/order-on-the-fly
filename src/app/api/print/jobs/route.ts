import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { listPrintJobs } from "@/domains/printing/print-job-service";

export async function GET(req: NextRequest) {
  const session = await requireSession(["OWNER", "MANAGER", "SERVER"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  const jobs = await listPrintJobs(session.restaurantId, Math.min(100, Math.max(1, limit)));
  const pending = jobs.filter((job) => job.status === "PENDING" || job.status === "SENT" || job.status === "FAILED");

  return NextResponse.json({
    jobs: jobs.map((job) => ({
      id: job.id,
      kind: job.kind,
      status: job.status,
      attempts: job.attempts,
      lastError: job.lastError,
      orderId: job.orderId,
      createdAt: job.createdAt,
      reprintOfPrintJobId: job.reprintOfPrintJobId,
    })),
    pendingCount: pending.length,
  });
}

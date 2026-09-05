import { NextResponse } from "next/server";
import { retryPendingPrintJobs } from "@/domains/printing/print-job-service";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

function authorize(req: Request) {
  const secret = process.env.JOB_CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handlePOST(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const retried = await retryPendingPrintJobs(20);
  return NextResponse.json({ retried });
}

export const POST = withForensicApiRoute(handlePOST);

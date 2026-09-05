import { NextResponse } from "next/server";
import { processPendingJobs } from "@/lib/job-queue";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handlePOST(req: Request) {
  const secret = process.env.JOB_CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const processed = await processPendingJobs(50);
  return NextResponse.json({ ok: true, processed });
}

export const POST = withForensicApiRoute(handlePOST);

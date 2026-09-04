import { NextRequest, NextResponse } from "next/server";
import { authenticatePrinterAgent } from "@/lib/printer-agent-service";
import { reportPrintJobResult } from "@/domains/printing/print-job-service";
import { agentMatchesRestaurantHost } from "@/lib/print-agent-host";
import { isAgentPullEnabled } from "@/lib/print-constants";
import { opaqueNotFoundJson, resolveRequestRestaurant } from "@/platform/tenant-scope";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handlePOST(req: NextRequest) {
  if (!isAgentPullEnabled()) {
    return NextResponse.json({ error: "Agent pull is disabled" }, { status: 409 });
  }
  const agent = await authenticatePrinterAgent(req.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const resolution = await resolveRequestRestaurant(req);
  if (!agentMatchesRestaurantHost(agent, resolution)) return opaqueNotFoundJson();

  const body = await req.json().catch(() => ({}));
  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  const claimToken = typeof body.claimToken === "string" ? body.claimToken : "";
  const outcome = body.outcome === "ACKED" || body.outcome === "FAILED" || body.outcome === "AMBIGUOUS"
    ? body.outcome
    : "";
  if (!jobId || !claimToken || !outcome) {
    return NextResponse.json({ error: "jobId, claimToken, and outcome are required" }, { status: 400 });
  }

  const result = await reportPrintJobResult({
    agent,
    jobId,
    claimToken,
    outcome,
    errorCode: typeof body.errorCode === "string" ? body.errorCode : null,
    errorMessage: typeof body.errorMessage === "string" ? body.errorMessage : null,
  });
  if (!result.ok) {
    if (result.status === 404) return opaqueNotFoundJson();
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, status: result.job.status });
}

export const POST = withForensicApiRoute(handlePOST);

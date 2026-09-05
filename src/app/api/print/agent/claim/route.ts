import { NextRequest, NextResponse } from "next/server";
import { authenticatePrinterAgent } from "@/lib/printer-agent-service";
import { claimNextPrintJob } from "@/domains/printing/print-job-service";
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
  const version = typeof body.version === "string" ? body.version : undefined;
  const claimed = await claimNextPrintJob(agent, version);
  return NextResponse.json(claimed);
}

export const POST = withForensicApiRoute(handlePOST);

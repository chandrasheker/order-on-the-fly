import { NextRequest, NextResponse } from "next/server";
import { authenticatePrinterAgent } from "@/lib/printer-agent-service";
import { claimNextPrintJob } from "@/domains/printing/print-job-service";
import { agentMatchesRestaurantHost } from "@/lib/print-agent-host";
import { opaqueNotFoundJson, resolveRequestRestaurant } from "@/platform/tenant-scope";

export async function POST(req: NextRequest) {
  const agent = await authenticatePrinterAgent(req.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const resolution = await resolveRequestRestaurant(req);
  if (!agentMatchesRestaurantHost(agent, resolution)) return opaqueNotFoundJson();

  const body = await req.json().catch(() => ({}));
  const version = typeof body.version === "string" ? body.version : undefined;
  const claimed = await claimNextPrintJob(agent, version);
  return NextResponse.json(claimed);
}

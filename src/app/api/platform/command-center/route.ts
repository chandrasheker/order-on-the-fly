import { NextRequest, NextResponse } from "next/server";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";
import { getCommandCenter } from "@/platform/command-center/metrics-service";
import { requireApexPlatformAdmin } from "@/platform/command-center/platform-admin-gate";
import { resolveTimeRange } from "@/platform/command-center/time-range";

async function handleGET(req: NextRequest) {
  const gate = await requireApexPlatformAdmin(req);
  if (!gate.ok) return gate.response;
  const search = req.nextUrl.searchParams;
  const payload = await getCommandCenter({
    range: resolveTimeRange({
      preset: search.get("range") ?? search.get("preset"),
      from: search.get("from"),
      to: search.get("to"),
    }),
  });
  return NextResponse.json(payload);
}

export const GET = withForensicApiRoute(handleGET, { suppressRequestEvent: true });

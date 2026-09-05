import { NextRequest, NextResponse } from "next/server";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";
import { getCommandCenter } from "@/platform/command-center/metrics-service";
import { requireApexPlatformAdmin } from "@/platform/command-center/platform-admin-gate";
import { resolveTimeRange } from "@/platform/command-center/time-range";

async function handleGET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string; restaurantId: string }> },
) {
  const gate = await requireApexPlatformAdmin(req);
  if (!gate.ok) return gate.response;
  const { tenantId, restaurantId } = await params;
  const search = req.nextUrl.searchParams;
  try {
    const payload = await getCommandCenter({
      tenantId,
      restaurantId,
      range: resolveTimeRange({
        preset: search.get("range") ?? search.get("preset"),
        from: search.get("from"),
        to: search.get("to"),
      }),
    });
    if (!payload.restaurants.length) {
      return NextResponse.json({ error: "Restaurant not found in tenant" }, { status: 404 });
    }
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof Error && (error as Error & { status?: number }).status === 404) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}

export const GET = withForensicApiRoute(handleGET, { suppressRequestEvent: true });

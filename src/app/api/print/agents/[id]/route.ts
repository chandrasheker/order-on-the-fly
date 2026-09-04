import { NextRequest, NextResponse } from "next/server";
import { canMutatePrinterAgentCredentials, requireSession } from "@/lib/auth";
import { updatePrinterAgent } from "@/lib/printer-agent-service";
import { opaqueNotFoundJson } from "@/platform/tenant-scope";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canMutatePrinterAgentCredentials(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const result = await updatePrinterAgent({
    restaurantId: session.restaurantId,
    agentId: id,
    name: typeof body.name === "string" ? body.name : undefined,
    branchId: body.branchId === null ? null : typeof body.branchId === "string" ? body.branchId : undefined,
    allowedTargets: Array.isArray(body.allowedTargets) ? body.allowedTargets.map(String) : undefined,
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    rotateToken: body.action === "rotate",
    revoke: body.action === "revoke",
  });
  if (!result.ok) {
    if (result.status === 404) return opaqueNotFoundJson();
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ agent: result.agent, token: result.token ?? null });
}

import { NextRequest, NextResponse } from "next/server";
import { canMutatePrinterAgentCredentials, canManageMenu, requireSession } from "@/lib/auth";
import { createPrinterAgent, listPrinterAgents } from "@/lib/printer-agent-service";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const agents = await listPrinterAgents(session.restaurantId);
  return NextResponse.json({ agents });
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canMutatePrinterAgentCredentials(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: session.restaurantId },
    select: { tenantId: true },
  });
  const result = await createPrinterAgent({
    restaurantId: session.restaurantId,
    tenantId: restaurant?.tenantId,
    branchId: typeof body.branchId === "string" && body.branchId.trim() ? body.branchId : null,
    name: typeof body.name === "string" ? body.name : "",
    allowedTargets: Array.isArray(body.allowedTargets) ? body.allowedTargets.map(String) : undefined,
    createdByUserId: session.id,
    createdByName: session.name,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ agent: result.agent, token: result.token });
}

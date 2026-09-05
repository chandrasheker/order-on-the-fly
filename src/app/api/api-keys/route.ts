import { NextRequest, NextResponse } from "next/server";
import { requireSession, canManageMenu } from "@/lib/auth";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/api-key-service";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET() {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const keys = await listApiKeys(session.restaurantId);
  return NextResponse.json({ keys });
}

export const GET = withForensicApiRoute(handleGET);

async function handlePOST(req: NextRequest) {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const result = await createApiKey({
    restaurantId: session.restaurantId,
    name: String(body.name ?? "Integration key"),
    scopes: body.scopes,
  });

  return NextResponse.json(
    { apiKey: result.apiKey, secret: result.secret, warning: "Copy the secret now — it won't be shown again." },
    { status: 201 },
  );
}

export const POST = withForensicApiRoute(handlePOST);

async function handleDELETE(req: NextRequest) {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await revokeApiKey(session.restaurantId, id);
  return NextResponse.json({ ok: true });
}

export const DELETE = withForensicApiRoute(handleDELETE);

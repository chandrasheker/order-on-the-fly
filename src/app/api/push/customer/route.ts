import { NextRequest, NextResponse } from "next/server";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";
import { loadTableByQrForRequest, opaqueNotFoundJson } from "@/platform/tenant-scope";
import { assertCustomerDiningAccess } from "@/lib/customer-dining-guard";
import { savePushSubscription } from "@/lib/push-notification-service";

async function handlePOST(req: NextRequest) {
  const body = await req.json();
  const tableToken = String(body.tableToken ?? "");
  const sessionKey = String(body.sessionKey ?? "");
  const endpoint = String(body.endpoint ?? "");
  const p256dh = String(body.keys?.p256dh ?? body.p256dh ?? "");
  const auth = String(body.keys?.auth ?? body.auth ?? "");

  if (!tableToken || !sessionKey || !endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const { table, resolution } = await loadTableByQrForRequest(req, tableToken);
  if (!resolution.ok || !table) return opaqueNotFoundJson();

  const dining = await assertCustomerDiningAccess(req, tableToken, sessionKey);
  if (!dining.ok) {
    return NextResponse.json({ error: dining.error, code: dining.code }, { status: dining.status });
  }

  const sub = await savePushSubscription({
    restaurantId: table.restaurantId,
    audience: "CUSTOMER",
    tableId: table.id,
    endpoint,
    p256dh,
    auth,
  });

  return NextResponse.json({ ok: true, id: sub.id });
}

export const POST = withForensicApiRoute(handlePOST);

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { savePushSubscription } from "@/lib/push-notification-service";
import { isFeatureEnabled } from "@/lib/feature-flags";

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const enabled = await isFeatureEnabled(session.restaurantId, "push_alerts");
  if (!enabled) {
    return NextResponse.json({ error: "Push alerts not enabled" }, { status: 403 });
  }

  const body = await req.json();
  const endpoint = String(body.endpoint ?? "");
  const p256dh = String(body.keys?.p256dh ?? body.p256dh ?? "");
  const auth = String(body.keys?.auth ?? body.auth ?? "");

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const sub = await savePushSubscription({
    restaurantId: session.restaurantId,
    userId: session.id,
    endpoint,
    p256dh,
    auth,
  });

  return NextResponse.json({ subscription: sub });
}

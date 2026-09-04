import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/push-notification-service";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET() {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return NextResponse.json({ error: "Push not configured" }, { status: 503 });
  }
  return NextResponse.json({ publicKey });
}

export const GET = withForensicApiRoute(handleGET);

import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/push-notification-service";

export async function GET() {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return NextResponse.json({ error: "Push not configured" }, { status: 503 });
  }
  return NextResponse.json({ publicKey });
}

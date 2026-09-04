import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null });
  }
  return NextResponse.json({ user: session });
}

export const GET = withForensicApiRoute(handleGET);

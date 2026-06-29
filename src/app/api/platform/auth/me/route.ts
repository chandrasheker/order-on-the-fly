import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth";

export async function GET() {
  const admin = await requirePlatformAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ admin });
}

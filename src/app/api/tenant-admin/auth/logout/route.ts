import { NextResponse } from "next/server";
import { TENANT_ADMIN_COOKIE, staffSessionCookieOptions } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(TENANT_ADMIN_COOKIE, "", { ...staffSessionCookieOptions(), maxAge: 0 });
  return response;
}

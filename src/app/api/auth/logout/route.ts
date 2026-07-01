import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { STAFF_SESSION_COOKIE, verifyToken } from "@/lib/auth";
import { endStaffSession } from "@/lib/staff-session-service";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(STAFF_SESSION_COOKIE)?.value;
  if (token) {
    const payload = await verifyToken(token);
    if (payload?.staffSessionId) {
      await endStaffSession(payload.staffSessionId);
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete(STAFF_SESSION_COOKIE);
  return response;
}

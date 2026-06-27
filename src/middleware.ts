import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "tabletap-super-secret-key-change-in-production"
);

async function getSession(request: NextRequest) {
  const token = request.cookies.get("tabletap_session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch {
    return null;
  }
}

function isPublicApi(pathname: string, request: NextRequest) {
  if (pathname === "/api/auth/login") return true;
  if (pathname === "/api/auth/me") return true;
  if (/^\/api\/menu\/[^/]+\/[^/]+$/.test(pathname)) return true;
  if (pathname === "/api/orders") {
    if (request.method === "POST") return true;
    if (request.method === "GET" && request.nextUrl.searchParams.has("tableToken")) {
      return true;
    }
  }
  if (pathname === "/api/feedback" && request.method === "POST") return true;
  if (pathname === "/api/rewards/spin") return true;
  if (pathname === "/api/rewards" && request.method === "POST") return true;
  if (/^\/api\/orders\/[^/]+$/.test(pathname) && request.method === "PATCH") {
    return true;
  }
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await getSession(request);

  if (pathname === "/staff/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (pathname === "/" && session) {
    return NextResponse.redirect(new URL("/staff/dashboard", request.url));
  }

  if (pathname.startsWith("/order/")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin/")) {
    if (!session) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    const role = session.role as string;
    const reportsOnly = pathname.startsWith("/admin/reports");
    if (!reportsOnly && role !== "OWNER" && role !== "MANAGER") {
      return NextResponse.redirect(new URL("/staff/dashboard", request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/staff/")) {
    if (!session) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    if (isPublicApi(pathname, request)) {
      return NextResponse.next();
    }
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};

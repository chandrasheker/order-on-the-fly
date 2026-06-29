import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "tabletap-super-secret-key-change-in-production"
);

async function getStaffSession(request: NextRequest) {
  const token = request.cookies.get("tabletap_session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.type === "platform_admin") return null;
    return payload;
  } catch {
    return null;
  }
}

async function getPlatformAdminSession(request: NextRequest) {
  const token = request.cookies.get("tabletap_admin_session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.type !== "platform_admin") return null;
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
  if (pathname === "/api/tables/session") return true;
  if (pathname === "/api/platform/auth/login" && request.method === "POST") return true;
  if (/^\/api\/orders\/[^/]+$/.test(pathname) && request.method === "PATCH") {
    return true;
  }
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await getStaffSession(request);
  const platformAdmin = await getPlatformAdminSession(request);

  if (pathname.startsWith("/platform")) {
    if (pathname === "/platform/login") {
      if (platformAdmin) {
        return NextResponse.redirect(new URL("/platform", request.url));
      }
      return NextResponse.next();
    }
    if (!platformAdmin) {
      return NextResponse.redirect(new URL("/platform/login", request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/platform/")) {
    if (pathname === "/api/platform/auth/login" && request.method === "POST") {
      return NextResponse.next();
    }
    if (!platformAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

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
    if (reportsOnly && role !== "OWNER" && role !== "MANAGER") {
      return NextResponse.redirect(new URL("/staff/dashboard", request.url));
    }
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

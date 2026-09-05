import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import {
  classifyRequestHost,
  sessionMatchesHostSlug,
  blocksRestaurantOperationsOnHost,
  allowsApexPublicLanding,
  decidePlatformRouting,
  HOST_KIND_HEADER,
  HOST_NAME_HEADER,
  HOST_SLUG_HEADER,
} from "@/platform/host";
import { getJwtSecretBytes } from "@/lib/jwt-secret";

function jwtSecret() {
  return getJwtSecretBytes();
}

async function getStaffSession(request: NextRequest) {
  const token = request.cookies.get("tabletap_session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwtSecret());
    if (payload.type === "platform_admin" || payload.type === "tenant_admin") return null;
    return payload;
  } catch {
    return null;
  }
}

async function getPlatformAdminSession(request: NextRequest) {
  const token = request.cookies.get("tabletap_admin_session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwtSecret());
    if (payload.type !== "platform_admin") return null;
    return payload;
  } catch {
    return null;
  }
}

function isPublicApi(pathname: string, request: NextRequest) {
  if (pathname === "/api/health") return true;
  if (pathname === "/api/tenant/signup" && request.method === "POST") return true;
  if (pathname.startsWith("/api/v1/")) return true;
  if (/^\/api\/payment\/qr\/[^/]+$/.test(pathname)) return true;
  if (/^\/api\/branding\/background\/[^/]+$/.test(pathname) && request.method === "GET") return true;
  if (pathname === "/api/auth/login") return true;
  if (pathname === "/api/auth/me") return true;
  if (/^\/api\/menu\/[^/]+\/[^/]+$/.test(pathname)) return true;
  if (/^\/api\/menu\/media\/[^/]+$/.test(pathname) && request.method === "GET") return true;
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
  if (pathname === "/api/tables/check-in" && request.method === "POST") return true;
  if (pathname === "/api/tables/dining-status" && request.method === "GET") return true;
  if (pathname === "/api/table-switch" && (request.method === "GET" || request.method === "POST")) {
    return true;
  }
  if (pathname === "/api/platform/auth/login" && request.method === "POST") return true;
  if (pathname === "/api/tenant-admin/auth/login" && request.method === "POST") return true;
  if (pathname === "/api/tenant-admin/auth/me" && request.method === "GET") return true;
  if (/^\/api\/webhooks\/orders\/[^/]+$/.test(pathname) && request.method === "POST") return true;
  if (/^\/api\/webhooks\/(swiggy|zomato)\/[^/]+$/.test(pathname) && request.method === "POST") return true;
  if (/^\/api\/webhooks\/payment\/[^/]+$/.test(pathname) && request.method === "POST") return true;
  if (pathname === "/api/payments/gateway/create" && request.method === "POST") return true;
  if (pathname === "/api/payments/gateway/verify" && request.method === "POST") return true;
  if (/^\/api\/payments\/gateway\/[^/]+$/.test(pathname) && (request.method === "GET" || request.method === "POST")) {
    return true;
  }
  if (/^\/api\/receipts\/public\/[^/]+$/.test(pathname) && request.method === "GET") return true;
  if (pathname.startsWith("/api/print/agent/") && request.method === "POST") return true;
  if (pathname === "/api/print/ack" && request.method === "POST") return true;
  if (pathname === "/api/guest/service-request" && request.method === "POST") return true;
  if (pathname === "/api/push/vapid" && request.method === "GET") return true;
  if (/^\/api\/orders\/[^/]+$/.test(pathname) && request.method === "PATCH") {
    return true;
  }
  return false;
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimitMemory(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

function withSecurityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
}

function opaqueNotFound(pathname: string) {
  if (pathname.startsWith("/api/")) {
    return withSecurityHeaders(NextResponse.json({ error: "Not found" }, { status: 404 }));
  }
  return withSecurityHeaders(new NextResponse("Not found", { status: 404 }));
}

/** Health, jobs, print, webhooks, tenant signup — not platform admin. */
function isInfrastructurePrivilegedPath(pathname: string) {
  return (
    pathname === "/api/health" ||
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/print/") ||
    pathname.startsWith("/api/jobs/") ||
    pathname === "/api/tenant/signup" ||
    pathname === "/tenant/signup"
  );
}

function nextWithHost(request: NextRequest) {
  const host = classifyRequestHost(request.headers);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(HOST_KIND_HEADER, host.kind);
  requestHeaders.set(HOST_NAME_HEADER, "hostname" in host ? host.hostname : "");
  if (host.kind === "restaurant") {
    requestHeaders.set(HOST_SLUG_HEADER, host.slug);
  }
  return withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const classified = classifyRequestHost(request.headers);
  const privileged = isInfrastructurePrivilegedPath(pathname);
  const hostKey = classified.kind === "restaurant" ? classified.slug : classified.hostname || "unknown";

  const platformDecision = decidePlatformRouting(pathname, classified, { method: request.method });
  if (platformDecision.kind === "deny") {
    return opaqueNotFound(pathname);
  }
  if (platformDecision.kind === "redirect") {
    return withSecurityHeaders(NextResponse.redirect(new URL(platformDecision.location, request.url)));
  }

  if (
    platformDecision.kind !== "allow" &&
    blocksRestaurantOperationsOnHost(classified) &&
    !privileged &&
    !allowsApexPublicLanding(pathname, classified)
  ) {
    return opaqueNotFound(pathname);
  }

  if (pathname === "/api/auth/login" && request.method === "POST") {
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    if (!checkRateLimitMemory(`login:${hostKey}:${ip}`, 20, 60_000)) {
      return withSecurityHeaders(
        NextResponse.json({ error: "Too many login attempts" }, { status: 429 }),
      );
    }
  }

  if (pathname === "/api/orders" && request.method === "POST") {
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    if (!checkRateLimitMemory(`order:${hostKey}:${ip}`, 60, 60_000)) {
      return withSecurityHeaders(
        NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 }),
      );
    }
  }

  let session = await getStaffSession(request);
  if (
    session &&
    classified.kind === "restaurant" &&
    !privileged &&
    !sessionMatchesHostSlug(
      typeof session.restaurantSlug === "string" ? session.restaurantSlug : "",
      classified,
    )
  ) {
    if (pathname.startsWith("/api/") && !isPublicApi(pathname, request)) {
      return withSecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    session = null;
  }

  const platformAdmin = await getPlatformAdminSession(request);

  if (pathname.startsWith("/platform")) {
    if (pathname === "/platform/login") {
      if (platformAdmin) {
        return NextResponse.redirect(new URL("/platform", request.url));
      }
      return nextWithHost(request);
    }
    if (pathname === "/platform/tenants") {
      return NextResponse.redirect(new URL("/platform", request.url));
    }
    if (!platformAdmin) {
      return NextResponse.redirect(new URL("/platform/login", request.url));
    }
    return nextWithHost(request);
  }

  if (pathname === "/tenant/login" || pathname === "/tenant" || pathname.startsWith("/tenant/")) {
    if (pathname === "/tenant/signup") {
      return nextWithHost(request);
    }
    return nextWithHost(request);
  }

  if (pathname.startsWith("/api/tenant-admin/")) {
    if (pathname === "/api/tenant-admin/auth/login" && request.method === "POST") {
      return nextWithHost(request);
    }
    if (pathname === "/api/tenant-admin/auth/me" && request.method === "GET") {
      return nextWithHost(request);
    }
    return nextWithHost(request);
  }

  if (pathname.startsWith("/api/platform/")) {
    if (pathname === "/api/platform/auth/login" && request.method === "POST") {
      return nextWithHost(request);
    }
    if (pathname === "/api/platform/audit" || pathname.startsWith("/api/platform/audit/")) {
      return nextWithHost(request);
    }
    if (!platformAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return nextWithHost(request);
  }

  if (pathname === "/staff/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (pathname === "/" && session && !blocksRestaurantOperationsOnHost(classified)) {
    return NextResponse.redirect(new URL("/staff/dashboard", request.url));
  }

  if (pathname.startsWith("/kitchen")) {
    if (!session) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    const role = session.role as string;
    if (role !== "OWNER" && role !== "MANAGER" && role !== "COOK") {
      return NextResponse.redirect(new URL("/staff/dashboard", request.url));
    }
    return nextWithHost(request);
  }

  if (pathname.startsWith("/staff/floor")) {
    if (!session) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return nextWithHost(request);
  }

  if (pathname.startsWith("/order/") || pathname.startsWith("/receipt/")) {
    return nextWithHost(request);
  }

  if (pathname.startsWith("/admin/")) {
    if (!session) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    const role = session.role as string;
    const reportsOnly = pathname.startsWith("/admin/reports");
    const integrationsOnly = pathname.startsWith("/admin/integrations");
    if (reportsOnly && role !== "OWNER" && role !== "MANAGER") {
      return NextResponse.redirect(new URL("/staff/dashboard", request.url));
    }
    if (integrationsOnly && role !== "OWNER" && role !== "MANAGER") {
      return NextResponse.redirect(new URL("/staff/dashboard", request.url));
    }
    if (!reportsOnly && !integrationsOnly && role !== "OWNER" && role !== "MANAGER") {
      return NextResponse.redirect(new URL("/staff/dashboard", request.url));
    }
    return nextWithHost(request);
  }

  if (pathname.startsWith("/staff/")) {
    if (!session) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return nextWithHost(request);
  }

  if (pathname.startsWith("/api/")) {
    if (isPublicApi(pathname, request)) {
      return nextWithHost(request);
    }
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return nextWithHost(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.svg$|api/branding/background/upload|api/payment/settings/upload|api/menu/manage/.+/image|api/menu/imports).*)",
  ],
};

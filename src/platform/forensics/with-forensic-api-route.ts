import { NextRequest, NextResponse } from "next/server";
import {
  AUDIT_ACTION,
  AUDIT_CATEGORY,
  AUDIT_EVENT_KIND,
  AUDIT_SEVERITY,
  AUDIT_SOURCE,
} from "@/platform/forensics/constants";
import { forensicHostname, forensicUserAgent, resolveClientIp } from "@/platform/forensics/client-ip";
import { classifyHttpOutcome, routeTemplateFromPath } from "@/platform/forensics/route-template";
import { tryAppendPlatformAuditEvent } from "@/platform/forensics/platform-audit-service";
import {
  generateRequestId,
  getForensicContext,
  runWithForensicContext,
} from "@/platform/forensics/request-context";
import { logApiError } from "@/lib/logger";
import { sanitizeErrorText } from "@/platform/forensics/redactor";

type RouteContext = { params?: Promise<Record<string, string>> | Record<string, string> };

export type ForensicRouteOptions = {
  suppressRequestEvent?: boolean;
  source?: string;
};

export function withForensicApiRoute<TContext extends RouteContext>(
  handler: (request: NextRequest, context: TContext) => Promise<Response> | Response,
  options?: ForensicRouteOptions,
) {
  return async (request: NextRequest, context: TContext) => {
    const requestId = generateRequestId();
    const startedAt = Date.now();
    const hostname = forensicHostname(request.headers);
    const ip = resolveClientIp(request.headers, { hostname });
    const routeTemplate = routeTemplateFromPath(request.nextUrl.pathname);

    return runWithForensicContext(
      {
        requestId,
        startedAt,
        method: request.method,
        routeTemplate,
        hostname,
        clientIp: ip.clientIp,
        clientIpSource: ip.clientIpSource,
        forwardedFor: ip.forwardedFor,
        userAgent: forensicUserAgent(request.headers),
        source: options?.source ?? AUDIT_SOURCE.API,
        suppressRequestEvent: options?.suppressRequestEvent,
      },
      async () => {
        try {
          const response = await handler(request, context);
          const durationMs = Date.now() - startedAt;
          response.headers.set("X-Request-ID", requestId);
          const ctx = getForensicContext();
          if (!options?.suppressRequestEvent && !ctx?.suppressRequestEvent) {
            await tryAppendPlatformAuditEvent({
              eventKind: AUDIT_EVENT_KIND.REQUEST,
              severity: response.status >= 500 ? AUDIT_SEVERITY.ERROR : AUDIT_SEVERITY.INFO,
              category: AUDIT_CATEGORY.SYSTEM,
              action: AUDIT_ACTION.API_REQUEST,
              outcome: classifyHttpOutcome(response.status, ctx?.securityDenied),
              httpStatus: response.status,
              durationMs,
              httpMethod: request.method,
              route: routeTemplate,
            });
          }
          return response;
        } catch (error) {
          const durationMs = Date.now() - startedAt;
          logApiError(routeTemplate, request.method, error, { requestId });
          await tryAppendPlatformAuditEvent({
            eventKind: AUDIT_EVENT_KIND.ERROR,
            severity: AUDIT_SEVERITY.ERROR,
            category: AUDIT_CATEGORY.SYSTEM,
            action: AUDIT_ACTION.REQUEST_FAILED,
            outcome: "FAILED",
            httpStatus: 500,
            durationMs,
            httpMethod: request.method,
            route: routeTemplate,
            error,
            errorType: error instanceof Error ? error.name : "Error",
            errorMessage: sanitizeErrorText(error),
          });
          const response = NextResponse.json({ error: "Internal server error" }, { status: 500 });
          response.headers.set("X-Request-ID", requestId);
          return response;
        }
      },
    );
  };
}

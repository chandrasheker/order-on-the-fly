import { NextRequest, NextResponse } from "next/server";
import {
  AUDIT_ACTION,
  AUDIT_ACTOR_TYPE,
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

type AppRouteContext = { params: Promise<Record<string, string | string[] | undefined>> };

function caughtErrorFields(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  return {
    error,
    errorType: error instanceof Error ? error.name : "Error",
    errorCode: typeof code === "string" || typeof code === "number" ? String(code) : undefined,
    errorMessage: sanitizeErrorText(error),
  };
}

export type ForensicRouteOptions = {
  suppressRequestEvent?: boolean;
  source?: string;
};

export function withForensicApiRoute<C extends { params: Promise<unknown> } = AppRouteContext>(
  handler: (request: NextRequest, context: C) => Promise<Response> | Response,
  options?: ForensicRouteOptions,
): (request: NextRequest, context: C) => Promise<Response> {
  return async (request: NextRequest, context: C) => {
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
        actor: { type: AUDIT_ACTOR_TYPE.ANONYMOUS },
      },
      async () => {
        try {
          const response = await handler(request, context);
          const durationMs = Date.now() - startedAt;
          response.headers.set("X-Request-ID", requestId);
          const ctx = getForensicContext();
          if (response.status >= 500 && ctx?.caughtError != null) {
            await tryAppendPlatformAuditEvent({
              eventKind: AUDIT_EVENT_KIND.ERROR,
              severity: AUDIT_SEVERITY.ERROR,
              category: AUDIT_CATEGORY.SYSTEM,
              action: AUDIT_ACTION.REQUEST_FAILED,
              outcome: "FAILED",
              httpStatus: response.status,
              durationMs,
              httpMethod: request.method,
              route: routeTemplate,
              ...caughtErrorFields(ctx.caughtError),
            });
          }
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
            ...caughtErrorFields(error),
          });
          const response = NextResponse.json({ error: "Internal server error" }, { status: 500 });
          response.headers.set("X-Request-ID", requestId);
          return response;
        }
      },
    );
  };
}

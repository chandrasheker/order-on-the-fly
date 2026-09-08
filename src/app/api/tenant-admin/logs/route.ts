import { NextRequest, NextResponse } from "next/server";
import { requireTenantAdminFromRequest } from "@/lib/tenant-admin-auth";
import { AUDIT_ACTION, AUDIT_ACTOR_TYPE, AUDIT_CATEGORY } from "@/platform/forensics/constants";
import { auditFilterSummary, tryAppendPlatformAuditEvent } from "@/platform/forensics/platform-audit-service";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";
import {
  CommandCenterScopeError,
  parseLogSearchParams,
  queryScopedLogs,
  rejectScopeOverride,
  resolveTenantLogScope,
} from "@/platform/command-center/scoped-audit";

async function handleGET(req: NextRequest) {
  const auth = await requireTenantAdminFromRequest(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = auth.session.tenantId;
  try {
    rejectScopeOverride(req.nextUrl.searchParams, { tenantId });
    const restaurantId = req.nextUrl.searchParams.get("restaurantId");
    const resolved = await resolveTenantLogScope(tenantId, restaurantId);
    const parsed = parseLogSearchParams(req.nextUrl.searchParams);
    const result = await queryScopedLogs(resolved.scope, parsed.query, parsed.aggregateErrors);
    await tryAppendPlatformAuditEvent({
      category: AUDIT_CATEGORY.PLATFORM,
      action: AUDIT_ACTION.AUDIT_VIEWED,
      actorType: AUDIT_ACTOR_TYPE.TENANT_ADMIN,
      actorId: auth.session.id,
      actorName: auth.session.name,
      actorRole: "TENANT_ADMIN",
      tenantId,
      restaurantId: resolved.scope.kind === "restaurant" ? resolved.scope.restaurantId : null,
      metadata: { filters: auditFilterSummary({ ...parsed.query, scope: resolved.scope }), scope: resolved.scope.kind },
    });
    return NextResponse.json({
      ...result,
      preset: parsed.preset,
      tenant: { id: resolved.tenant.id, name: resolved.tenant.name },
      restaurants: resolved.restaurants,
    });
  } catch (error) {
    if (error instanceof CommandCenterScopeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export const GET = withForensicApiRoute(handleGET, { suppressRequestEvent: true });

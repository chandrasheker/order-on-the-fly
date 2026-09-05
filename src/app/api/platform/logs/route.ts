import { NextRequest, NextResponse } from "next/server";
import { AUDIT_ACTION, AUDIT_ACTOR_TYPE, AUDIT_CATEGORY } from "@/platform/forensics/constants";
import { auditFilterSummary, tryAppendPlatformAuditEvent } from "@/platform/forensics/platform-audit-service";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";
import { CommandCenterScopeError, parseLogSearchParams, queryScopedLogs, rejectScopeOverride } from "@/platform/command-center/scoped-audit";
import { requireApexPlatformAdmin } from "@/platform/command-center/platform-admin-gate";

async function handleGET(req: NextRequest) {
  const gate = await requireApexPlatformAdmin(req);
  if (!gate.ok) return gate.response;

  try {
    rejectScopeOverride(req.nextUrl.searchParams, {});
    const parsed = parseLogSearchParams(req.nextUrl.searchParams);
    const result = await queryScopedLogs({ kind: "platform" }, parsed.query, parsed.aggregateErrors);
    await tryAppendPlatformAuditEvent({
      category: AUDIT_CATEGORY.PLATFORM,
      action: AUDIT_ACTION.AUDIT_VIEWED,
      actorType: AUDIT_ACTOR_TYPE.PLATFORM_ADMIN,
      actorId: gate.admin.id,
      actorName: gate.admin.name,
      actorRole: "PLATFORM_ADMIN",
      metadata: { filters: auditFilterSummary({ ...parsed.query, scope: { kind: "platform" } }), scope: "platform" },
    });
    return NextResponse.json({ ...result, preset: parsed.preset });
  } catch (error) {
    if (error instanceof CommandCenterScopeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export const GET = withForensicApiRoute(handleGET, { suppressRequestEvent: true });

CREATE TABLE IF NOT EXISTS "PlatformAuditEvent" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventKind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "requestId" TEXT,
    "correlationId" TEXT,
    "actorType" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "actorRole" TEXT,
    "actorSessionId" TEXT,
    "tenantId" TEXT,
    "restaurantId" TEXT,
    "branchId" TEXT,
    "floorId" TEXT,
    "hostname" TEXT,
    "clientIp" TEXT,
    "clientIpSource" TEXT,
    "forwardedFor" TEXT,
    "userAgent" TEXT,
    "httpMethod" TEXT,
    "route" TEXT,
    "httpStatus" INTEGER,
    "durationMs" INTEGER,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "resourceLabel" TEXT,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "diffJson" TEXT,
    "metadataJson" TEXT,
    "errorType" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "errorFingerprint" TEXT,
    CONSTRAINT "PlatformAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PlatformAuditEvent_occurredAt_idx" ON "PlatformAuditEvent"("occurredAt");
CREATE INDEX IF NOT EXISTS "PlatformAuditEvent_recordedAt_idx" ON "PlatformAuditEvent"("recordedAt");
CREATE INDEX IF NOT EXISTS "PlatformAuditEvent_category_occurredAt_idx" ON "PlatformAuditEvent"("category", "occurredAt");
CREATE INDEX IF NOT EXISTS "PlatformAuditEvent_outcome_occurredAt_idx" ON "PlatformAuditEvent"("outcome", "occurredAt");
CREATE INDEX IF NOT EXISTS "PlatformAuditEvent_actorId_occurredAt_idx" ON "PlatformAuditEvent"("actorId", "occurredAt");
CREATE INDEX IF NOT EXISTS "PlatformAuditEvent_restaurantId_occurredAt_idx" ON "PlatformAuditEvent"("restaurantId", "occurredAt");
CREATE INDEX IF NOT EXISTS "PlatformAuditEvent_tenantId_occurredAt_idx" ON "PlatformAuditEvent"("tenantId", "occurredAt");
CREATE INDEX IF NOT EXISTS "PlatformAuditEvent_clientIp_occurredAt_idx" ON "PlatformAuditEvent"("clientIp", "occurredAt");
CREATE INDEX IF NOT EXISTS "PlatformAuditEvent_requestId_idx" ON "PlatformAuditEvent"("requestId");
CREATE INDEX IF NOT EXISTS "PlatformAuditEvent_correlationId_idx" ON "PlatformAuditEvent"("correlationId");
CREATE INDEX IF NOT EXISTS "PlatformAuditEvent_resourceType_resourceId_occurredAt_idx" ON "PlatformAuditEvent"("resourceType", "resourceId", "occurredAt");

CREATE OR REPLACE FUNCTION prevent_platform_audit_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'PlatformAuditEvent is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS platform_audit_event_no_update ON "PlatformAuditEvent";
CREATE TRIGGER platform_audit_event_no_update
BEFORE UPDATE ON "PlatformAuditEvent"
FOR EACH ROW EXECUTE PROCEDURE prevent_platform_audit_event_mutation();

DROP TRIGGER IF EXISTS platform_audit_event_no_delete ON "PlatformAuditEvent";
CREATE TRIGGER platform_audit_event_no_delete
BEFORE DELETE ON "PlatformAuditEvent"
FOR EACH ROW EXECUTE PROCEDURE prevent_platform_audit_event_mutation();

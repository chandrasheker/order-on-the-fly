-- CreateTable
CREATE TABLE "PlatformAuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "occurredAt" DATETIME NOT NULL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "errorFingerprint" TEXT
);

CREATE INDEX "PlatformAuditEvent_occurredAt_idx" ON "PlatformAuditEvent"("occurredAt");
CREATE INDEX "PlatformAuditEvent_recordedAt_idx" ON "PlatformAuditEvent"("recordedAt");
CREATE INDEX "PlatformAuditEvent_category_occurredAt_idx" ON "PlatformAuditEvent"("category", "occurredAt");
CREATE INDEX "PlatformAuditEvent_outcome_occurredAt_idx" ON "PlatformAuditEvent"("outcome", "occurredAt");
CREATE INDEX "PlatformAuditEvent_actorId_occurredAt_idx" ON "PlatformAuditEvent"("actorId", "occurredAt");
CREATE INDEX "PlatformAuditEvent_restaurantId_occurredAt_idx" ON "PlatformAuditEvent"("restaurantId", "occurredAt");
CREATE INDEX "PlatformAuditEvent_tenantId_occurredAt_idx" ON "PlatformAuditEvent"("tenantId", "occurredAt");
CREATE INDEX "PlatformAuditEvent_clientIp_occurredAt_idx" ON "PlatformAuditEvent"("clientIp", "occurredAt");
CREATE INDEX "PlatformAuditEvent_requestId_idx" ON "PlatformAuditEvent"("requestId");
CREATE INDEX "PlatformAuditEvent_correlationId_idx" ON "PlatformAuditEvent"("correlationId");
CREATE INDEX "PlatformAuditEvent_resourceType_resourceId_occurredAt_idx" ON "PlatformAuditEvent"("resourceType", "resourceId", "occurredAt");

CREATE TRIGGER "platform_audit_event_no_update"
BEFORE UPDATE ON "PlatformAuditEvent"
BEGIN
    SELECT RAISE(ABORT, 'PlatformAuditEvent is append-only');
END;

CREATE TRIGGER "platform_audit_event_no_delete"
BEFORE DELETE ON "PlatformAuditEvent"
BEGIN
    SELECT RAISE(ABORT, 'PlatformAuditEvent is append-only');
END;

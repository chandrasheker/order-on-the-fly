-- AlterTable
ALTER TABLE "PrintJob" ADD COLUMN "target" TEXT NOT NULL DEFAULT 'kitchen';
ALTER TABLE "PrintJob" ADD COLUMN "payloadVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "PrintJob" ADD COLUMN "lastErrorCode" TEXT;
ALTER TABLE "PrintJob" ADD COLUMN "claimedByAgentId" TEXT;
ALTER TABLE "PrintJob" ADD COLUMN "claimToken" TEXT;
ALTER TABLE "PrintJob" ADD COLUMN "leaseExpiresAt" DATETIME;
ALTER TABLE "PrintJob" ADD COLUMN "nextAttemptAt" DATETIME;
ALTER TABLE "PrintJob" ADD COLUMN "lastAttemptAt" DATETIME;

UPDATE "PrintJob" SET "target" = 'bill' WHERE "kind" = 'customer_bill';
UPDATE "PrintJob" SET "status" = 'PENDING', "nextAttemptAt" = CURRENT_TIMESTAMP
WHERE "status" = 'SENT' AND "leaseExpiresAt" IS NULL;

CREATE INDEX "PrintJob_restaurantId_status_target_createdAt_idx" ON "PrintJob"("restaurantId", "status", "target", "createdAt");
CREATE INDEX "PrintJob_claimToken_idx" ON "PrintJob"("claimToken");

-- CreateTable
CREATE TABLE "PrinterAgent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "restaurantId" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "allowedTargetsJson" TEXT NOT NULL DEFAULT '["kitchen","bill"]',
    "lastSeenAt" DATETIME,
    "version" TEXT,
    "lastError" TEXT,
    "createdByUserId" TEXT,
    "createdByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    CONSTRAINT "PrinterAgent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PrinterAgent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PrinterAgent_restaurantId_enabled_idx" ON "PrinterAgent"("restaurantId", "enabled");
CREATE INDEX "PrinterAgent_tokenPrefix_idx" ON "PrinterAgent"("tokenPrefix");

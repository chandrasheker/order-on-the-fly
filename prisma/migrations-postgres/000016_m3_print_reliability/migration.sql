CREATE TYPE "PrintJobStatus" AS ENUM ('PENDING', 'SENT', 'ACKED', 'FAILED');

CREATE TABLE IF NOT EXISTS "PrintJob" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tenantId" TEXT,
    "branchId" TEXT,
    "orderId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'kitchen_chit',
    "target" TEXT NOT NULL DEFAULT 'kitchen',
    "payloadVersion" INTEGER NOT NULL DEFAULT 1,
    "payload" TEXT NOT NULL,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'PENDING',
    "ackToken" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "lastErrorCode" TEXT,
    "sentAt" TIMESTAMP(3),
    "ackedAt" TIMESTAMP(3),
    "claimedByAgentId" TEXT,
    "claimToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "reprintOfPrintJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "target" TEXT NOT NULL DEFAULT 'kitchen';
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "payloadVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "lastErrorCode" TEXT;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "claimedByAgentId" TEXT;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "claimToken" TEXT;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "leaseExpiresAt" TIMESTAMP(3);
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "nextAttemptAt" TIMESTAMP(3);
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "lastAttemptAt" TIMESTAMP(3);

UPDATE "PrintJob" SET "target" = 'bill' WHERE "kind" = 'customer_bill';
UPDATE "PrintJob" SET "status" = 'PENDING', "nextAttemptAt" = CURRENT_TIMESTAMP
WHERE "status" = 'SENT' AND "leaseExpiresAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "PrintJob_ackToken_key" ON "PrintJob"("ackToken");
CREATE UNIQUE INDEX IF NOT EXISTS "PrintJob_restaurantId_idempotencyKey_key" ON "PrintJob"("restaurantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "PrintJob_restaurantId_status_idx" ON "PrintJob"("restaurantId", "status");
CREATE INDEX IF NOT EXISTS "PrintJob_restaurantId_status_target_createdAt_idx" ON "PrintJob"("restaurantId", "status", "target", "createdAt");
CREATE INDEX IF NOT EXISTS "PrintJob_status_createdAt_idx" ON "PrintJob"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "PrintJob_claimToken_idx" ON "PrintJob"("claimToken");

CREATE TABLE IF NOT EXISTS "PrinterAgent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "restaurantId" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "allowedTargetsJson" TEXT NOT NULL DEFAULT '["kitchen","bill"]',
    "lastSeenAt" TIMESTAMP(3),
    "version" TEXT,
    "lastError" TEXT,
    "createdByUserId" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "PrinterAgent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PrinterAgent_restaurantId_enabled_idx" ON "PrinterAgent"("restaurantId", "enabled");
CREATE INDEX IF NOT EXISTS "PrinterAgent_tokenPrefix_idx" ON "PrinterAgent"("tokenPrefix");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PrintJob_restaurantId_fkey'
  ) THEN
    ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PrintJob_orderId_fkey'
  ) THEN
    ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PrinterAgent_restaurantId_fkey'
  ) THEN
    ALTER TABLE "PrinterAgent" ADD CONSTRAINT "PrinterAgent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PrintJob_claimedByAgentId_fkey'
  ) THEN
    ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_claimedByAgentId_fkey" FOREIGN KEY ("claimedByAgentId") REFERENCES "PrinterAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "MenuImport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "restaurantId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceFileCount" INTEGER NOT NULL,
    "pageCount" INTEGER,
    "draftJson" TEXT,
    "sourceMetaJson" TEXT,
    "appliedResultJson" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "processingAttempt" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "MenuImport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MenuImport_restaurantId_createdAt_idx" ON "MenuImport"("restaurantId", "createdAt");
CREATE INDEX IF NOT EXISTS "MenuImport_status_updatedAt_idx" ON "MenuImport"("status", "updatedAt");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'MenuImport_restaurantId_fkey'
    ) THEN
        ALTER TABLE "MenuImport"
            ADD CONSTRAINT "MenuImport_restaurantId_fkey"
            FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

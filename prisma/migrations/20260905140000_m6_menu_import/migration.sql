-- CreateTable
CREATE TABLE "MenuImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "processedAt" DATETIME,
    "appliedAt" DATETIME,
    "cancelledAt" DATETIME,
    CONSTRAINT "MenuImport_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MenuImport_restaurantId_createdAt_idx" ON "MenuImport"("restaurantId", "createdAt");
CREATE INDEX "MenuImport_status_updatedAt_idx" ON "MenuImport"("status", "updatedAt");

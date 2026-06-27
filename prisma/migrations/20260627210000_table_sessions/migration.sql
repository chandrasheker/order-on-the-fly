-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN "defaultMaxSessions" INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "Table" ADD COLUMN "maxSessions" INTEGER NOT NULL DEFAULT 2;

-- CreateTable
CREATE TABLE "TableSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionKey" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TableSession_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TableSession_tableId_sessionKey_key" ON "TableSession"("tableId", "sessionKey");

-- CreateIndex
CREATE INDEX "TableSession_tableId_lastSeenAt_idx" ON "TableSession"("tableId", "lastSeenAt");

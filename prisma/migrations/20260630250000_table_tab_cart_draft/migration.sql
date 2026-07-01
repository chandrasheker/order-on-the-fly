-- Table visit tab + cart drafts for floor ordering state
ALTER TABLE "Table" ADD COLUMN "currentTabId" TEXT;
ALTER TABLE "Table" ADD COLUMN "tabPaymentRequestedAt" DATETIME;

ALTER TABLE "Order" ADD COLUMN "tabId" TEXT;

CREATE TABLE "TableCartDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tableId" TEXT NOT NULL,
    "draftKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "itemsJson" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TableCartDraft_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TableCartDraft_tableId_draftKey_source_key" ON "TableCartDraft"("tableId", "draftKey", "source");
CREATE INDEX "TableCartDraft_tableId_updatedAt_idx" ON "TableCartDraft"("tableId", "updatedAt");

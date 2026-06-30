CREATE TABLE "TableSwitchRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "customerName" TEXT,
    "sessionKey" TEXT NOT NULL,
    "note" TEXT,
    "sourceTableNumber" INTEGER NOT NULL,
    "targetTableNumber" INTEGER NOT NULL,
    "sourceTableId" TEXT NOT NULL,
    "targetTableId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "approvedByName" TEXT,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TableSwitchRequest_sourceTableId_fkey" FOREIGN KEY ("sourceTableId") REFERENCES "Table" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TableSwitchRequest_targetTableId_fkey" FOREIGN KEY ("targetTableId") REFERENCES "Table" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TableSwitchRequest_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TableSwitchRequest_restaurantId_status_idx" ON "TableSwitchRequest"("restaurantId", "status");

CREATE INDEX "TableSwitchRequest_sourceTableId_status_idx" ON "TableSwitchRequest"("sourceTableId", "status");

CREATE INDEX "TableSwitchRequest_targetTableId_idx" ON "TableSwitchRequest"("targetTableId");

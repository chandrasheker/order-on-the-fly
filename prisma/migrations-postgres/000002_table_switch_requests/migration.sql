CREATE TYPE "TableSwitchRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "TableSwitchRequest" (
    "id" TEXT NOT NULL,
    "status" "TableSwitchRequestStatus" NOT NULL DEFAULT 'PENDING',
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
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TableSwitchRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TableSwitchRequest_restaurantId_status_idx" ON "TableSwitchRequest"("restaurantId", "status");
CREATE INDEX "TableSwitchRequest_sourceTableId_status_idx" ON "TableSwitchRequest"("sourceTableId", "status");
CREATE INDEX "TableSwitchRequest_targetTableId_idx" ON "TableSwitchRequest"("targetTableId");

ALTER TABLE "TableSwitchRequest" ADD CONSTRAINT "TableSwitchRequest_sourceTableId_fkey" FOREIGN KEY ("sourceTableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TableSwitchRequest" ADD CONSTRAINT "TableSwitchRequest_targetTableId_fkey" FOREIGN KEY ("targetTableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TableSwitchRequest" ADD CONSTRAINT "TableSwitchRequest_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

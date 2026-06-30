-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN "swiggyItemId" TEXT;
ALTER TABLE "MenuItem" ADD COLUMN "zomatoItemId" TEXT;

CREATE TABLE "AggregatorConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "outletId" TEXT,
    "apiKeyEnc" TEXT,
    "apiSecretEnc" TEXT,
    "webhookSecret" TEXT,
    "autoConfirm" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "lastOrderAt" DATETIME,
    "lastError" TEXT,
    "configuredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AggregatorConnection_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AggregatorConnection_restaurantId_platform_key" ON "AggregatorConnection"("restaurantId", "platform");
CREATE INDEX "Order_restaurantId_orderChannel_externalOrderId_idx" ON "Order"("restaurantId", "orderChannel", "externalOrderId");

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN "serviceMode" TEXT NOT NULL DEFAULT 'FULL_SERVICE';
ALTER TABLE "Restaurant" ADD COLUMN "pickupLocationLabel" TEXT NOT NULL DEFAULT 'Pickup Counter';
ALTER TABLE "Restaurant" ADD COLUMN "hybridDefaultFulfillment" TEXT NOT NULL DEFAULT 'TABLE_SERVICE';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "fulfillmentMode" TEXT NOT NULL DEFAULT 'TABLE_SERVICE';
ALTER TABLE "Order" ADD COLUMN "pickupCode" TEXT;
ALTER TABLE "Order" ADD COLUMN "readyAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "collectedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "readyPaymentRequiredNotifiedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "readyForCollectionNotifiedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "collectionReminderNotifiedAt" DATETIME;

CREATE INDEX "Order_restaurantId_fulfillmentMode_status_idx" ON "Order"("restaurantId", "fulfillmentMode", "status");

ALTER TABLE "PushSubscription" ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'STAFF';
ALTER TABLE "PushSubscription" ADD COLUMN "tableId" TEXT;
CREATE INDEX "PushSubscription_restaurantId_audience_tableId_idx" ON "PushSubscription"("restaurantId", "audience", "tableId");

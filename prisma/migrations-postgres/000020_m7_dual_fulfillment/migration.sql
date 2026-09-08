ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "serviceMode" TEXT NOT NULL DEFAULT 'FULL_SERVICE';
ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "pickupLocationLabel" TEXT NOT NULL DEFAULT 'Pickup Counter';
ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "hybridDefaultFulfillment" TEXT NOT NULL DEFAULT 'TABLE_SERVICE';

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "fulfillmentMode" TEXT NOT NULL DEFAULT 'TABLE_SERVICE';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "pickupCode" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "readyAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "collectedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "readyPaymentRequiredNotifiedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "readyForCollectionNotifiedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "collectionReminderNotifiedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Order_restaurantId_fulfillmentMode_status_idx"
  ON "Order"("restaurantId", "fulfillmentMode", "status");

ALTER TABLE "PushSubscription" ADD COLUMN IF NOT EXISTS "audience" TEXT NOT NULL DEFAULT 'STAFF';
ALTER TABLE "PushSubscription" ADD COLUMN IF NOT EXISTS "tableId" TEXT;
CREATE INDEX IF NOT EXISTS "PushSubscription_restaurantId_audience_tableId_idx"
  ON "PushSubscription"("restaurantId", "audience", "tableId");

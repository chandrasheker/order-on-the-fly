-- AlterTable
ALTER TABLE "AggregatorConnection" ADD COLUMN "autoMenuSync" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AggregatorConnection" ADD COLUMN "pushStatusUpdates" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AggregatorConnection" ADD COLUMN "lastMenuSyncAt" DATETIME;

ALTER TABLE "Order" ADD COLUMN "aggregatorReadyPushedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "aggregatorPickedUpPushedAt" DATETIME;

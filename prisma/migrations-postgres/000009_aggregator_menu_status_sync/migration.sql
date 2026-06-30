-- AlterTable
ALTER TABLE "AggregatorConnection" ADD COLUMN "autoMenuSync" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AggregatorConnection" ADD COLUMN "pushStatusUpdates" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AggregatorConnection" ADD COLUMN "lastMenuSyncAt" TIMESTAMP(3);

ALTER TABLE "Order" ADD COLUMN "aggregatorReadyPushedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "aggregatorPickedUpPushedAt" TIMESTAMP(3);

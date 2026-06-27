-- AlterTable
ALTER TABLE "Order" ADD COLUMN "rewardSpun" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Reward" ADD COLUMN "expiresAt" DATETIME;

-- Backfill expiresAt for existing rewards (48h from createdAt)
UPDATE "Reward" SET "expiresAt" = datetime("createdAt", "+48 hours") WHERE "expiresAt" IS NULL;

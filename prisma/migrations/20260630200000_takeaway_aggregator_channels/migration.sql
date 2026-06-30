-- CreateEnum replacements for SQLite (stored as TEXT)
-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN "aggregatorWebhookSecret" TEXT;

ALTER TABLE "Table" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'DINE_IN';
ALTER TABLE "Table" ADD COLUMN "serviceLabel" TEXT;

ALTER TABLE "Order" ADD COLUMN "customerPhone" TEXT;
ALTER TABLE "Order" ADD COLUMN "orderChannel" TEXT NOT NULL DEFAULT 'DINE_IN';
ALTER TABLE "Order" ADD COLUMN "externalOrderId" TEXT;
ALTER TABLE "Order" ADD COLUMN "orderNotes" TEXT;

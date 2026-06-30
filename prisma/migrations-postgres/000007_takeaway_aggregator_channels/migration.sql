-- CreateEnum
CREATE TYPE "TableKind" AS ENUM ('DINE_IN', 'TAKEAWAY', 'DELIVERY', 'AGGREGATOR');
CREATE TYPE "OrderChannel" AS ENUM ('DINE_IN', 'TAKEAWAY', 'DELIVERY', 'SWIGGY', 'ZOMATO', 'WALK_IN');

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN "aggregatorWebhookSecret" TEXT;

ALTER TABLE "Table" ADD COLUMN "kind" "TableKind" NOT NULL DEFAULT 'DINE_IN';
ALTER TABLE "Table" ADD COLUMN "serviceLabel" TEXT;

ALTER TABLE "Order" ADD COLUMN "customerPhone" TEXT;
ALTER TABLE "Order" ADD COLUMN "orderChannel" "OrderChannel" NOT NULL DEFAULT 'DINE_IN';
ALTER TABLE "Order" ADD COLUMN "externalOrderId" TEXT;
ALTER TABLE "Order" ADD COLUMN "orderNotes" TEXT;

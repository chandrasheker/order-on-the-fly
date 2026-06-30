-- CreateEnum
CREATE TYPE "AggregatorPlatform" AS ENUM ('SWIGGY', 'ZOMATO');
CREATE TYPE "AggregatorConnectionStatus" AS ENUM ('NOT_CONFIGURED', 'CREDENTIALS_SAVED', 'WEBHOOK_PENDING', 'CONNECTED', 'ERROR');

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN "swiggyItemId" TEXT;
ALTER TABLE "MenuItem" ADD COLUMN "zomatoItemId" TEXT;

-- CreateTable
CREATE TABLE "AggregatorConnection" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "platform" "AggregatorPlatform" NOT NULL,
    "outletId" TEXT,
    "apiKeyEnc" TEXT,
    "apiSecretEnc" TEXT,
    "webhookSecret" TEXT,
    "autoConfirm" BOOLEAN NOT NULL DEFAULT true,
    "status" "AggregatorConnectionStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "lastOrderAt" TIMESTAMP(3),
    "lastError" TEXT,
    "configuredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AggregatorConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AggregatorConnection_restaurantId_platform_key" ON "AggregatorConnection"("restaurantId", "platform");
CREATE INDEX "Order_restaurantId_orderChannel_externalOrderId_idx" ON "Order"("restaurantId", "orderChannel", "externalOrderId");

ALTER TABLE "AggregatorConnection" ADD CONSTRAINT "AggregatorConnection_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

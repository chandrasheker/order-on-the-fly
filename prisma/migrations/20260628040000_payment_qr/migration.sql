-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN "paymentQrUrl" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "paymentRequestedAt" DATETIME;

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN "receiptAddress" TEXT;
ALTER TABLE "Restaurant" ADD COLUMN "receiptPhone" TEXT;
ALTER TABLE "Restaurant" ADD COLUMN "receiptGstin" TEXT;
ALTER TABLE "Restaurant" ADD COLUMN "receiptGstEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Restaurant" ADD COLUMN "receiptGstRate" REAL NOT NULL DEFAULT 5;
ALTER TABLE "Restaurant" ADD COLUMN "receiptFooter" TEXT;

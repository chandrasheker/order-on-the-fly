-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "missedTimeline" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrderItem" ADD COLUMN "minutesLate" INTEGER;

-- AlterTable
ALTER TABLE "Alert" ADD COLUMN "targetUserId" TEXT;
ALTER TABLE "Alert" ADD COLUMN "categorySlug" TEXT;

-- CreateIndex
CREATE INDEX "Alert_targetUserId_idx" ON "Alert"("targetUserId");

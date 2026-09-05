-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN "imageStorageKey" TEXT;
ALTER TABLE "MenuItem" ADD COLUMN "imageRevision" INTEGER NOT NULL DEFAULT 0;

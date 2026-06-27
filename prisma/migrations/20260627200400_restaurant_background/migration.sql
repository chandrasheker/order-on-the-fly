-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN "backgroundImageUrl" TEXT;

-- Varanasi demo: Street View of Varanasi Hotel V
UPDATE "Restaurant"
SET "backgroundImageUrl" = '/restaurants/varanasi-hotel-background.jpg'
WHERE "slug" = 'varanasi';

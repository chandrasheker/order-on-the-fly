-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN "backgroundImageUrl" TEXT;

-- Dvadtech demo: Street View of Dvadtech Hotel V
UPDATE "Restaurant"
SET "backgroundImageUrl" = '/restaurants/dvadtech-hotel-background.jpg'
WHERE "slug" = 'dvadtech';

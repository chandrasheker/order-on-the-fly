-- Dine-in tables stay QR-available by default. Owner/staff can still disable a table.

ALTER TABLE "Table" ALTER COLUMN "orderingEnabled" SET DEFAULT true;
UPDATE "Table" SET "orderingEnabled" = true WHERE "number" < 900;

-- Restore staff-gated dine-in QR admission.
-- Close existing guest tables (service counters are 900+).
-- Does not delete sessions, orders, or other open work.

ALTER TABLE "Table" ALTER COLUMN "orderingEnabled" SET DEFAULT false;
UPDATE "Table" SET "orderingEnabled" = false WHERE "number" < 900;

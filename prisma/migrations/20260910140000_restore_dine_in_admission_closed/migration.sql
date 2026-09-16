-- Restore staff-gated dine-in QR admission.
-- SQLite cannot ALTER a column default in place; Prisma/client uses schema @default(false)
-- for new inserts. Close existing guest tables (service counters are 900+).
-- Does not delete sessions, orders, or other open work.

UPDATE "Table" SET "orderingEnabled" = 0 WHERE "number" < 900;

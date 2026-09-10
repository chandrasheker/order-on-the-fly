-- Dine-in tables stay QR-available by default. Owner/staff can still disable a table.
-- SQLite cannot ALTER a column default in place; Prisma/client uses schema @default(true)
-- for new inserts. Backfill existing guest tables (service counters are 900+).

UPDATE "Table" SET "orderingEnabled" = 1 WHERE "number" < 900;

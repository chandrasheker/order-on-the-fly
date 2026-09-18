-- GST on receipts can be included in menu MRP or added on top.
-- Default included so printed bills match the menu price.

ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "receiptGstInclusive" BOOLEAN NOT NULL DEFAULT true;

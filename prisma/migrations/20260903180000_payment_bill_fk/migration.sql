-- SQLite cannot ALTER an existing table to add a foreign key.
-- Rebuild Payment so billId references Bill(id) ON DELETE SET NULL.
PRAGMA foreign_keys=OFF;

CREATE TABLE "Payment_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "tenantId" TEXT,
    "branchId" TEXT,
    "tableId" TEXT NOT NULL,
    "orderId" TEXT,
    "billId" TEXT,
    "amount" REAL NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'UPI',
    "status" TEXT NOT NULL DEFAULT 'CAPTURED',
    "verificationStatus" TEXT,
    "cashTendered" REAL,
    "cashChange" REAL,
    "idempotencyKey" TEXT,
    "provider" TEXT,
    "providerPaymentId" TEXT,
    "refundOfPaymentId" TEXT,
    "note" TEXT,
    "collectedByUserId" TEXT,
    "collectedByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedAt" DATETIME,
    CONSTRAINT "Payment_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Payment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Payment_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "Payment_new" (
    "id",
    "restaurantId",
    "tenantId",
    "branchId",
    "tableId",
    "orderId",
    "billId",
    "amount",
    "method",
    "status",
    "verificationStatus",
    "cashTendered",
    "cashChange",
    "idempotencyKey",
    "provider",
    "providerPaymentId",
    "refundOfPaymentId",
    "note",
    "collectedByUserId",
    "collectedByName",
    "createdAt",
    "capturedAt"
)
SELECT
    "id",
    "restaurantId",
    "tenantId",
    "branchId",
    "tableId",
    "orderId",
    "billId",
    "amount",
    "method",
    "status",
    "verificationStatus",
    "cashTendered",
    "cashChange",
    "idempotencyKey",
    "provider",
    "providerPaymentId",
    "refundOfPaymentId",
    "note",
    "collectedByUserId",
    "collectedByName",
    "createdAt",
    "capturedAt"
FROM "Payment";

DROP TABLE "Payment";
ALTER TABLE "Payment_new" RENAME TO "Payment";

CREATE UNIQUE INDEX "Payment_restaurantId_idempotencyKey_key" ON "Payment"("restaurantId", "idempotencyKey");
CREATE UNIQUE INDEX "Payment_restaurantId_provider_providerPaymentId_key" ON "Payment"("restaurantId", "provider", "providerPaymentId");
CREATE INDEX "Payment_restaurantId_createdAt_idx" ON "Payment"("restaurantId", "createdAt");
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");
CREATE INDEX "Payment_tableId_idx" ON "Payment"("tableId");
CREATE INDEX "Payment_billId_idx" ON "Payment"("billId");
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

PRAGMA foreign_keys=ON;

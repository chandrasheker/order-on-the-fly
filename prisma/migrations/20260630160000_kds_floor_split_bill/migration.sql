-- Kitchen stations
CREATE TABLE "KitchenStation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "categorySlugs" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "restaurantId" TEXT NOT NULL,
    CONSTRAINT "KitchenStation_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "KitchenStation_restaurantId_slug_key" ON "KitchenStation"("restaurantId", "slug");

-- Floor plan fields on Table
ALTER TABLE "Table" ADD COLUMN "positionX" REAL;
ALTER TABLE "Table" ADD COLUMN "positionY" REAL;
ALTER TABLE "Table" ADD COLUMN "width" REAL DEFAULT 96;
ALTER TABLE "Table" ADD COLUMN "height" REAL DEFAULT 96;
ALTER TABLE "Table" ADD COLUMN "section" TEXT;
ALTER TABLE "Table" ADD COLUMN "assignedServerId" TEXT;
ALTER TABLE "Table" ADD COLUMN "seatedAt" DATETIME;
ALTER TABLE "Table" ADD COLUMN "guestCount" INTEGER;

-- Split payments
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "orderId" TEXT,
    "amount" REAL NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'UPI',
    "note" TEXT,
    "collectedByUserId" TEXT,
    "collectedByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Payment_restaurantId_createdAt_idx" ON "Payment"("restaurantId", "createdAt");
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");
CREATE INDEX "Payment_tableId_idx" ON "Payment"("tableId");

CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaymentAllocation_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PaymentAllocation_orderItemId_idx" ON "PaymentAllocation"("orderItemId");

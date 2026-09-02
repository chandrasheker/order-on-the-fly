-- AlterTable Payment ledger
ALTER TABLE "Payment" ADD COLUMN "billId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'CAPTURED';
ALTER TABLE "Payment" ADD COLUMN "verificationStatus" TEXT;
ALTER TABLE "Payment" ADD COLUMN "cashTendered" REAL;
ALTER TABLE "Payment" ADD COLUMN "cashChange" REAL;
ALTER TABLE "Payment" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "Payment" ADD COLUMN "provider" TEXT;
ALTER TABLE "Payment" ADD COLUMN "providerPaymentId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "refundOfPaymentId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "capturedAt" DATETIME;

-- AlterTable Print durability
ALTER TABLE "PrintJob" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "PrintJob" ADD COLUMN "reprintOfPrintJobId" TEXT;

-- AlterTable Restaurant manual UPI
ALTER TABLE "Restaurant" ADD COLUMN "upiVpa" TEXT;
ALTER TABLE "Restaurant" ADD COLUMN "upiMerchantName" TEXT;

-- AlterTable Reconciliation foundation
ALTER TABLE "PaymentReconciliation" ADD COLUMN "cashExpected" REAL NOT NULL DEFAULT 0;
ALTER TABLE "PaymentReconciliation" ADD COLUMN "cashCounted" REAL;
ALTER TABLE "PaymentReconciliation" ADD COLUMN "cashVariance" REAL;
ALTER TABLE "PaymentReconciliation" ADD COLUMN "manualUpiTotal" REAL NOT NULL DEFAULT 0;
ALTER TABLE "PaymentReconciliation" ADD COLUMN "automaticUpiTotal" REAL NOT NULL DEFAULT 0;
ALTER TABLE "PaymentReconciliation" ADD COLUMN "refundsTotal" REAL NOT NULL DEFAULT 0;
ALTER TABLE "PaymentReconciliation" ADD COLUMN "outstandingTotal" REAL NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "restaurantId" TEXT NOT NULL,
    "branchId" TEXT,
    "orderId" TEXT NOT NULL,
    "billNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FINALIZED',
    "snapshot" TEXT NOT NULL,
    "itemSubtotal" REAL NOT NULL,
    "orderDiscount" REAL NOT NULL DEFAULT 0,
    "gstAmount" REAL NOT NULL DEFAULT 0,
    "cgstAmount" REAL NOT NULL DEFAULT 0,
    "sgstAmount" REAL NOT NULL DEFAULT 0,
    "grandTotal" REAL NOT NULL,
    "finalizedAt" DATETIME,
    "finalizedByUserId" TEXT,
    "finalizedByName" TEXT,
    "voidedAt" DATETIME,
    "voidedByUserId" TEXT,
    "voidedByName" TEXT,
    "voidReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bill_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Bill_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Bill_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Bill_orderId_key" ON "Bill"("orderId");
CREATE UNIQUE INDEX "Bill_restaurantId_billNumber_key" ON "Bill"("restaurantId", "billNumber");
CREATE INDEX "Bill_restaurantId_createdAt_idx" ON "Bill"("restaurantId", "createdAt");
CREATE INDEX "Bill_tenantId_createdAt_idx" ON "Bill"("tenantId", "createdAt");

CREATE UNIQUE INDEX "Payment_restaurantId_idempotencyKey_key" ON "Payment"("restaurantId", "idempotencyKey");
CREATE UNIQUE INDEX "Payment_restaurantId_provider_providerPaymentId_key" ON "Payment"("restaurantId", "provider", "providerPaymentId");
CREATE INDEX "Payment_billId_idx" ON "Payment"("billId");
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

CREATE UNIQUE INDEX "PrintJob_restaurantId_idempotencyKey_key" ON "PrintJob"("restaurantId", "idempotencyKey");

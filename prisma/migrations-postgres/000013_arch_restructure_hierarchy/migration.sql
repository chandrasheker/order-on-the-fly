-- Phase A-F: Hierarchy (Floor), tenant scoping, print jobs, payment reconciliation (Postgres)

CREATE TABLE "Floor" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Floor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Floor_branchId_slug_key" ON "Floor"("branchId", "slug");
CREATE INDEX "Floor_restaurantId_branchId_idx" ON "Floor"("restaurantId", "branchId");

ALTER TABLE "Floor" ADD CONSTRAINT "Floor_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Branch" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Table" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Table" ADD COLUMN "floorId" TEXT;
ALTER TABLE "Table" ADD CONSTRAINT "Table_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Table" ADD CONSTRAINT "Table_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Order" ADD COLUMN "floorId" TEXT;
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "branchId" TEXT;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Alert" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Alert" ADD COLUMN "branchId" TEXT;
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BackgroundJob" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "BackgroundJob" ADD COLUMN "branchId" TEXT;

ALTER TABLE "PlatformEvent" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "PlatformEvent" ADD COLUMN "floorId" TEXT;
ALTER TABLE "PlatformEvent" ADD CONSTRAINT "PlatformEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PrintJob" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tenantId" TEXT,
    "branchId" TEXT,
    "orderId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'kitchen_chit',
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "ackToken" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "ackedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrintJob_ackToken_key" ON "PrintJob"("ackToken");
CREATE INDEX "PrintJob_restaurantId_status_idx" ON "PrintJob"("restaurantId", "status");
CREATE INDEX "PrintJob_status_createdAt_idx" ON "PrintJob"("status", "createdAt");

ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PaymentReconciliation" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tenantId" TEXT,
    "periodDate" TEXT NOT NULL,
    "expectedTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivedTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "variance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentReconciliation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentReconciliation_restaurantId_periodDate_key" ON "PaymentReconciliation"("restaurantId", "periodDate");
CREATE INDEX "PaymentReconciliation_tenantId_periodDate_idx" ON "PaymentReconciliation"("tenantId", "periodDate");

ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "BackgroundJob_tenantId_createdAt_idx" ON "BackgroundJob"("tenantId", "createdAt");
CREATE INDEX "PlatformEvent_tenantId_createdAt_idx" ON "PlatformEvent"("tenantId", "createdAt");

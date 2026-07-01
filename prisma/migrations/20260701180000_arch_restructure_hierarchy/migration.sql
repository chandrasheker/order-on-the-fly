-- Phase A-F: Hierarchy (Floor), tenant scoping, print jobs, payment reconciliation

CREATE TABLE "Floor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Floor_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Floor_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Floor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Floor_branchId_slug_key" ON "Floor"("branchId", "slug");
CREATE INDEX "Floor_restaurantId_branchId_idx" ON "Floor"("restaurantId", "branchId");

ALTER TABLE "Branch" ADD COLUMN "tenantId" TEXT REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "tenantId" TEXT REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Table" ADD COLUMN "tenantId" TEXT REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Table" ADD COLUMN "floorId" TEXT REFERENCES "Floor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order" ADD COLUMN "tenantId" TEXT REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD COLUMN "floorId" TEXT REFERENCES "Floor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD COLUMN "tenantId" TEXT REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD COLUMN "branchId" TEXT REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Alert" ADD COLUMN "tenantId" TEXT REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Alert" ADD COLUMN "branchId" TEXT REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BackgroundJob" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "BackgroundJob" ADD COLUMN "branchId" TEXT;

ALTER TABLE "PlatformEvent" ADD COLUMN "tenantId" TEXT REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlatformEvent" ADD COLUMN "floorId" TEXT;

CREATE TABLE "PrintJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "sentAt" DATETIME,
    "ackedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PrintJob_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PrintJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PrintJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PrintJob_ackToken_key" ON "PrintJob"("ackToken");
CREATE INDEX "PrintJob_restaurantId_status_idx" ON "PrintJob"("restaurantId", "status");
CREATE INDEX "PrintJob_status_createdAt_idx" ON "PrintJob"("status", "createdAt");

CREATE TABLE "PaymentReconciliation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "tenantId" TEXT,
    "periodDate" TEXT NOT NULL,
    "expectedTotal" REAL NOT NULL DEFAULT 0,
    "receivedTotal" REAL NOT NULL DEFAULT 0,
    "variance" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PaymentReconciliation_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaymentReconciliation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PaymentReconciliation_restaurantId_periodDate_key" ON "PaymentReconciliation"("restaurantId", "periodDate");
CREATE INDEX "PaymentReconciliation_tenantId_periodDate_idx" ON "PaymentReconciliation"("tenantId", "periodDate");

CREATE INDEX "BackgroundJob_tenantId_createdAt_idx" ON "BackgroundJob"("tenantId", "createdAt");
CREATE INDEX "PlatformEvent_tenantId_createdAt_idx" ON "PlatformEvent"("tenantId", "createdAt");

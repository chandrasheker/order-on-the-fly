-- CreateEnum
-- SQLite: enums stored as TEXT

-- AlterTable MenuItem
ALTER TABLE "MenuItem" ADD COLUMN "trackInventory" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MenuItem" ADD COLUMN "stockQuantity" INTEGER;
ALTER TABLE "MenuItem" ADD COLUMN "lowStockThreshold" INTEGER NOT NULL DEFAULT 5;

-- AlterTable Order
ALTER TABLE "Order" ADD COLUMN "tipAmount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "discountAmount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "compReason" TEXT;

-- CreateTable Reservation
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT NOT NULL,
    "partySize" INTEGER NOT NULL DEFAULT 2,
    "scheduledAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'WAITLIST',
    "tableId" TEXT,
    "notes" TEXT,
    "notifiedAt" DATETIME,
    "seatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Reservation_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reservation_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable ShiftClock
CREATE TABLE "ShiftClock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clockInAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clockOutAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShiftClock_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShiftClock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable GuestProfile
CREATE TABLE "GuestProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "visitCount" INTEGER NOT NULL DEFAULT 0,
    "totalSpend" REAL NOT NULL DEFAULT 0,
    "lastVisitAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GuestProfile_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable AuditLog
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "entityId" TEXT,
    "reason" TEXT,
    "payload" TEXT,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "approvedByUserId" TEXT,
    "approvedByName" TEXT,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable TipPoolPayout
CREATE TABLE "TipPoolPayout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "periodStart" TEXT NOT NULL,
    "periodEnd" TEXT NOT NULL,
    "totalTips" REAL NOT NULL,
    "exportData" TEXT NOT NULL,
    "createdByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TipPoolPayout_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GuestProfile_restaurantId_phone_key" ON "GuestProfile"("restaurantId", "phone");
CREATE INDEX "Reservation_restaurantId_status_idx" ON "Reservation"("restaurantId", "status");
CREATE INDEX "Reservation_restaurantId_scheduledAt_idx" ON "Reservation"("restaurantId", "scheduledAt");
CREATE INDEX "ShiftClock_restaurantId_clockInAt_idx" ON "ShiftClock"("restaurantId", "clockInAt");
CREATE INDEX "ShiftClock_userId_clockOutAt_idx" ON "ShiftClock"("userId", "clockOutAt");
CREATE INDEX "GuestProfile_restaurantId_lastVisitAt_idx" ON "GuestProfile"("restaurantId", "lastVisitAt");
CREATE INDEX "AuditLog_restaurantId_createdAt_idx" ON "AuditLog"("restaurantId", "createdAt");
CREATE INDEX "AuditLog_restaurantId_actionType_idx" ON "AuditLog"("restaurantId", "actionType");
CREATE INDEX "TipPoolPayout_restaurantId_periodStart_idx" ON "TipPoolPayout"("restaurantId", "periodStart");

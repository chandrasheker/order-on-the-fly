-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN "trackInventory" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MenuItem" ADD COLUMN "stockQuantity" INTEGER;
ALTER TABLE "MenuItem" ADD COLUMN "lowStockThreshold" INTEGER NOT NULL DEFAULT 5;

ALTER TABLE "Order" ADD COLUMN "tipAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "compReason" TEXT;

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('WAITLIST', 'CONFIRMED', 'NOTIFIED', 'SEATED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE "AuditActionType" AS ENUM ('REJECT_ITEM', 'VOID_ORDER', 'COMP', 'DISCOUNT', 'STOCK_ADJUST');

CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT NOT NULL,
    "partySize" INTEGER NOT NULL DEFAULT 2,
    "scheduledAt" TIMESTAMP(3),
    "status" "ReservationStatus" NOT NULL DEFAULT 'WAITLIST',
    "tableId" TEXT,
    "notes" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "seatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShiftClock" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clockInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clockOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShiftClock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestProfile" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "visitCount" INTEGER NOT NULL DEFAULT 0,
    "totalSpend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastVisitAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GuestProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "actionType" "AuditActionType" NOT NULL,
    "entityId" TEXT,
    "reason" TEXT,
    "payload" TEXT,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "approvedByUserId" TEXT,
    "approvedByName" TEXT,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TipPoolPayout" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "periodStart" TEXT NOT NULL,
    "periodEnd" TEXT NOT NULL,
    "totalTips" DOUBLE PRECISION NOT NULL,
    "exportData" TEXT NOT NULL,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TipPoolPayout_pkey" PRIMARY KEY ("id")
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

ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShiftClock" ADD CONSTRAINT "ShiftClock_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftClock" ADD CONSTRAINT "ShiftClock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestProfile" ADD CONSTRAINT "GuestProfile_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TipPoolPayout" ADD CONSTRAINT "TipPoolPayout_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

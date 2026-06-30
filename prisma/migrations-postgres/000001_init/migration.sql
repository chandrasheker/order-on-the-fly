-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'MANAGER', 'COOK', 'SERVER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'SERVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderItemStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'SERVED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "RewardStatus" AS ENUM ('PENDING', 'REDEEMED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RewardType" AS ENUM ('TEA', 'BEVERAGE');

-- CreateTable
CREATE TABLE "Restaurant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "backgroundImageUrl" TEXT,
    "rewardThresholdTea" DOUBLE PRECISION NOT NULL DEFAULT 250,
    "rewardThresholdBeverage" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "rewardTeaLabel" TEXT NOT NULL DEFAULT 'Free Masala Chai (next visit)',
    "rewardBeverageLabel" TEXT NOT NULL DEFAULT 'Free Beverage (next visit)',
    "defaultMaxSessions" INTEGER NOT NULL DEFAULT 2,
    "ownerSlots" INTEGER NOT NULL DEFAULT 1,
    "managerSlots" INTEGER NOT NULL DEFAULT 2,
    "cookSlots" INTEGER NOT NULL DEFAULT 3,
    "serverSlots" INTEGER NOT NULL DEFAULT 4,
    "staffConfigured" BOOLEAN NOT NULL DEFAULT false,
    "paymentQrUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Restaurant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "slotKey" TEXT,
    "plainPassword" TEXT,
    "restaurantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAdmin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Platform Admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Table" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "qrToken" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "orderingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "orderingOpenedAt" TIMESTAMP(3),
    "maxSessions" INTEGER NOT NULL DEFAULT 2,
    "restaurantId" TEXT NOT NULL,

    CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableSession" (
    "id" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "restaurantId" TEXT NOT NULL,

    CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "prepTimeMinutes" INTEGER NOT NULL DEFAULT 10,
    "imageUrl" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isVeg" BOOLEAN NOT NULL DEFAULT true,
    "isSpicy" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" INTEGER NOT NULL,
    "customerName" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "tableId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "alarmTriggered" BOOLEAN NOT NULL DEFAULT false,
    "rewardSpun" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "paymentRequestedAt" TIMESTAMP(3),
    "oosNoticeDismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "date" TEXT NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "OrderItemStatus" NOT NULL DEFAULT 'PENDING',
    "prepTimeMinutes" INTEGER NOT NULL,
    "expectedReadyAt" TIMESTAMP(3) NOT NULL,
    "servedAt" TIMESTAMP(3),
    "isOverdue" BOOLEAN NOT NULL DEFAULT false,
    "missedTimeline" BOOLEAN NOT NULL DEFAULT false,
    "minutesLate" INTEGER,
    "notes" TEXT,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "itemName" TEXT NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "message" TEXT,
    "customerName" TEXT,
    "tableNumber" INTEGER NOT NULL,
    "orderId" TEXT,
    "restaurantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reward" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "rewardType" "RewardType" NOT NULL,
    "rewardLabel" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "tableNumber" INTEGER NOT NULL,
    "orderTotal" DOUBLE PRECISION NOT NULL,
    "validDate" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "RewardStatus" NOT NULL DEFAULT 'PENDING',
    "orderId" TEXT,
    "restaurantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedAt" TIMESTAMP(3),

    CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "orderId" TEXT,
    "orderItemId" TEXT,
    "tableNumber" INTEGER NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_slug_key" ON "Restaurant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_restaurantId_slotKey_key" ON "User"("restaurantId", "slotKey");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdmin_email_key" ON "PlatformAdmin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Table_qrToken_key" ON "Table"("qrToken");

-- CreateIndex
CREATE UNIQUE INDEX "Table_restaurantId_number_key" ON "Table"("restaurantId", "number");

-- CreateIndex
CREATE INDEX "TableSession_tableId_lastSeenAt_idx" ON "TableSession"("tableId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "TableSession_tableId_sessionKey_key" ON "TableSession"("tableId", "sessionKey");

-- CreateIndex
CREATE UNIQUE INDEX "MenuCategory_restaurantId_slug_key" ON "MenuCategory"("restaurantId", "slug");

-- CreateIndex
CREATE INDEX "Order_restaurantId_date_idx" ON "Order"("restaurantId", "date");

-- CreateIndex
CREATE INDEX "Order_tableId_idx" ON "Order"("tableId");

-- CreateIndex
CREATE INDEX "Feedback_restaurantId_createdAt_idx" ON "Feedback"("restaurantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reward_code_key" ON "Reward"("code");

-- CreateIndex
CREATE INDEX "Reward_restaurantId_status_idx" ON "Reward"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "Reward_validDate_idx" ON "Reward"("validDate");

-- CreateIndex
CREATE INDEX "Alert_restaurantId_isRead_idx" ON "Alert"("restaurantId", "isRead");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


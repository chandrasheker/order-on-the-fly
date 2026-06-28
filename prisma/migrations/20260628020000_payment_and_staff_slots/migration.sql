-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN "ownerSlots" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Restaurant" ADD COLUMN "managerSlots" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "Restaurant" ADD COLUMN "cookSlots" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "Restaurant" ADD COLUMN "serverSlots" INTEGER NOT NULL DEFAULT 4;
ALTER TABLE "Restaurant" ADD COLUMN "staffConfigured" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "slotKey" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "paidAt" DATETIME;

-- CreateIndex
CREATE UNIQUE INDEX "User_restaurantId_slotKey_key" ON "User"("restaurantId", "slotKey");

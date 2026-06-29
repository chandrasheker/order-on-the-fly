-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stars" INTEGER NOT NULL,
    "message" TEXT,
    "customerName" TEXT,
    "tableNumber" INTEGER NOT NULL,
    "orderId" TEXT,
    "restaurantId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Feedback_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "rewardType" TEXT NOT NULL,
    "rewardLabel" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "tableNumber" INTEGER NOT NULL,
    "orderTotal" REAL NOT NULL,
    "validDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "orderId" TEXT,
    "restaurantId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedAt" DATETIME,
    CONSTRAINT "Reward_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Restaurant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "rewardThresholdTea" REAL NOT NULL DEFAULT 250,
    "rewardThresholdBeverage" REAL NOT NULL DEFAULT 500,
    "rewardTeaLabel" TEXT NOT NULL DEFAULT 'Free Masala Chai (next visit)',
    "rewardBeverageLabel" TEXT NOT NULL DEFAULT 'Free Beverage (next visit)',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Restaurant" ("createdAt", "id", "logoUrl", "name", "slug") SELECT "createdAt", "id", "logoUrl", "name", "slug" FROM "Restaurant";
DROP TABLE "Restaurant";
ALTER TABLE "new_Restaurant" RENAME TO "Restaurant";
CREATE UNIQUE INDEX "Restaurant_slug_key" ON "Restaurant"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Feedback_restaurantId_createdAt_idx" ON "Feedback"("restaurantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reward_code_key" ON "Reward"("code");

-- CreateIndex
CREATE INDEX "Reward_restaurantId_status_idx" ON "Reward"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "Reward_validDate_idx" ON "Reward"("validDate");

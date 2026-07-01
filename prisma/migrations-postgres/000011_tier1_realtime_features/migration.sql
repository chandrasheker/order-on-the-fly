-- Tier 1 real-time ops: promotions, modifiers, call waiter, kitchen capacity, payment webhooks, push

ALTER TABLE "Restaurant" ADD COLUMN "kitchenPaused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Restaurant" ADD COLUMN "kitchenPauseMessage" TEXT;
ALTER TABLE "Restaurant" ADD COLUMN "kitchenAutoPauseOverdueThreshold" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Restaurant" ADD COLUMN "paymentGatewayProvider" TEXT;
ALTER TABLE "Restaurant" ADD COLUMN "paymentGatewayKeyId" TEXT;
ALTER TABLE "Restaurant" ADD COLUMN "paymentGatewaySecretEnc" TEXT;
ALTER TABLE "Restaurant" ADD COLUMN "paymentWebhookSecret" TEXT;
ALTER TABLE "Restaurant" ADD COLUMN "pushAlertsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Restaurant" ADD COLUMN "smsAlertsEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Order" ADD COLUMN "promoCode" TEXT;
ALTER TABLE "Order" ADD COLUMN "promoDiscount" REAL NOT NULL DEFAULT 0;

ALTER TABLE "OrderItem" ADD COLUMN "modifiersJson" TEXT;

CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" REAL NOT NULL DEFAULT 0,
    "code" TEXT,
    "categorySlug" TEXT,
    "menuItemId" TEXT,
    "comboMealId" TEXT,
    "minOrderAmount" REAL NOT NULL DEFAULT 0,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "daysOfWeek" TEXT,
    "startHour" INTEGER,
    "endHour" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Promotion_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Promotion_restaurantId_isActive_idx" ON "Promotion"("restaurantId", "isActive");
CREATE INDEX "Promotion_restaurantId_code_idx" ON "Promotion"("restaurantId", "code");

CREATE TABLE "ComboMeal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "comboPrice" REAL NOT NULL,
    "imageUrl" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ComboMeal_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ComboMeal_restaurantId_idx" ON "ComboMeal"("restaurantId");

CREATE TABLE "ComboMealItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comboMealId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ComboMealItem_comboMealId_fkey" FOREIGN KEY ("comboMealId") REFERENCES "ComboMeal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ComboMealItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ComboMealItem_comboMealId_idx" ON "ComboMealItem"("comboMealId");

CREATE TABLE "ModifierGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModifierGroup_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ModifierGroup_restaurantId_idx" ON "ModifierGroup"("restaurantId");

CREATE TABLE "ModifierOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceDelta" REAL NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ModifierOption_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ModifierGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ModifierOption_groupId_idx" ON "ModifierOption"("groupId");

CREATE TABLE "MenuItemModifierGroup" (
    "menuItemId" TEXT NOT NULL,
    "modifierGroupId" TEXT NOT NULL,
    PRIMARY KEY ("menuItemId", "modifierGroupId"),
    CONSTRAINT "MenuItemModifierGroup_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MenuItemModifierGroup_modifierGroupId_fkey" FOREIGN KEY ("modifierGroupId") REFERENCES "ModifierGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "GuestServiceRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "sessionKey" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "acknowledgedByUserId" TEXT,
    "acknowledgedByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" DATETIME,
    "resolvedAt" DATETIME,
    CONSTRAINT "GuestServiceRequest_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GuestServiceRequest_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "GuestServiceRequest_restaurantId_status_idx" ON "GuestServiceRequest"("restaurantId", "status");

CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushSubscription_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_restaurantId_idx" ON "PushSubscription"("restaurantId");

CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "tableId" TEXT,
    "orderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "payload" TEXT,
    "processedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentWebhookEvent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_externalId_key" ON "PaymentWebhookEvent"("provider", "externalId");
CREATE INDEX "PaymentWebhookEvent_restaurantId_createdAt_idx" ON "PaymentWebhookEvent"("restaurantId", "createdAt");

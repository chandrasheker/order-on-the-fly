-- M2: restaurant-scoped gateway attempts, encrypted webhook secret, public receipt token.
ALTER TABLE "Restaurant" ADD COLUMN "paymentWebhookSecretEnc" TEXT;

ALTER TABLE "Bill" ADD COLUMN "publicToken" TEXT;
CREATE UNIQUE INDEX "Bill_publicToken_key" ON "Bill"("publicToken");

CREATE TABLE "GatewayPaymentAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicToken" TEXT NOT NULL,
    "tenantId" TEXT,
    "restaurantId" TEXT NOT NULL,
    "branchId" TEXT,
    "tableId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "billId" TEXT,
    "provider" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "providerPaymentId" TEXT,
    "providerReceipt" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "verifiedAt" DATETIME,
    "capturedAt" DATETIME,
    CONSTRAINT "GatewayPaymentAttempt_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GatewayPaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GatewayPaymentAttempt_publicToken_key" ON "GatewayPaymentAttempt"("publicToken");
CREATE UNIQUE INDEX "GatewayPaymentAttempt_restaurantId_idempotencyKey_key" ON "GatewayPaymentAttempt"("restaurantId", "idempotencyKey");
CREATE UNIQUE INDEX "GatewayPaymentAttempt_restaurantId_provider_providerOrderId_key" ON "GatewayPaymentAttempt"("restaurantId", "provider", "providerOrderId");
CREATE UNIQUE INDEX "GatewayPaymentAttempt_restaurantId_provider_providerPaymentId_key" ON "GatewayPaymentAttempt"("restaurantId", "provider", "providerPaymentId");
CREATE INDEX "GatewayPaymentAttempt_orderId_status_idx" ON "GatewayPaymentAttempt"("orderId", "status");
CREATE INDEX "GatewayPaymentAttempt_restaurantId_createdAt_idx" ON "GatewayPaymentAttempt"("restaurantId", "createdAt");

CREATE TABLE "GatewayRefundAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "gatewayAttemptId" TEXT,
    "amountPaise" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "providerRefundId" TEXT,
    "failureMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GatewayRefundAttempt_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GatewayRefundAttempt_restaurantId_idempotencyKey_key" ON "GatewayRefundAttempt"("restaurantId", "idempotencyKey");
CREATE UNIQUE INDEX "GatewayRefundAttempt_restaurantId_providerRefundId_key" ON "GatewayRefundAttempt"("restaurantId", "providerRefundId");
CREATE INDEX "GatewayRefundAttempt_paymentId_idx" ON "GatewayRefundAttempt"("paymentId");

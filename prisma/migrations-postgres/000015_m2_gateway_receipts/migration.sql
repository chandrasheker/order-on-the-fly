-- M1 financial catch-up (if missing) + M2 gateway attempts and public receipt tokens.

ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'MANUAL_UPI';
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'BILL_FINALIZED';
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'BILL_VOIDED';
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'PAYMENT_CAPTURED';
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'PAYMENT_REFUNDED';
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'PRINT_REPRINT';

DO $$ BEGIN
  CREATE TYPE "BillStatus" AS ENUM ('DRAFT', 'FINALIZED', 'VOIDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "upiVpa" TEXT;
ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "upiMerchantName" TEXT;
ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "paymentWebhookSecretEnc" TEXT;

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "billId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'CAPTURED';
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "verificationStatus" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cashTendered" DOUBLE PRECISION;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cashChange" DOUBLE PRECISION;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "providerPaymentId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "refundOfPaymentId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "capturedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "Bill" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "restaurantId" TEXT NOT NULL,
    "branchId" TEXT,
    "orderId" TEXT NOT NULL,
    "billNumber" TEXT NOT NULL,
    "publicToken" TEXT,
    "status" "BillStatus" NOT NULL DEFAULT 'FINALIZED',
    "snapshot" TEXT NOT NULL,
    "itemSubtotal" DOUBLE PRECISION NOT NULL,
    "orderDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grandTotal" DOUBLE PRECISION NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "finalizedByUserId" TEXT,
    "finalizedByName" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedByUserId" TEXT,
    "voidedByName" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "publicToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Bill_publicToken_key" ON "Bill"("publicToken");
CREATE UNIQUE INDEX IF NOT EXISTS "Bill_orderId_key" ON "Bill"("orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "Bill_restaurantId_billNumber_key" ON "Bill"("restaurantId", "billNumber");
CREATE INDEX IF NOT EXISTS "Bill_restaurantId_createdAt_idx" ON "Bill"("restaurantId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "Bill" ADD CONSTRAINT "Bill_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Bill" ADD CONSTRAINT "Bill_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Payment" ADD CONSTRAINT "Payment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Payment_restaurantId_idempotencyKey_key" ON "Payment"("restaurantId", "idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_restaurantId_provider_providerPaymentId_key" ON "Payment"("restaurantId", "provider", "providerPaymentId");
CREATE INDEX IF NOT EXISTS "Payment_billId_idx" ON "Payment"("billId");
CREATE INDEX IF NOT EXISTS "Payment_status_idx" ON "Payment"("status");

CREATE TABLE IF NOT EXISTS "GatewayPaymentAttempt" (
    "id" TEXT NOT NULL,
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
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3),
    CONSTRAINT "GatewayPaymentAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GatewayPaymentAttempt_publicToken_key" ON "GatewayPaymentAttempt"("publicToken");
CREATE UNIQUE INDEX IF NOT EXISTS "GatewayPaymentAttempt_restaurantId_idempotencyKey_key" ON "GatewayPaymentAttempt"("restaurantId", "idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "GatewayPaymentAttempt_restaurantId_provider_providerOrderId_key" ON "GatewayPaymentAttempt"("restaurantId", "provider", "providerOrderId");
CREATE UNIQUE INDEX IF NOT EXISTS "GatewayPaymentAttempt_restaurantId_provider_providerPaymentId_key" ON "GatewayPaymentAttempt"("restaurantId", "provider", "providerPaymentId");
CREATE INDEX IF NOT EXISTS "GatewayPaymentAttempt_orderId_status_idx" ON "GatewayPaymentAttempt"("orderId", "status");
CREATE INDEX IF NOT EXISTS "GatewayPaymentAttempt_restaurantId_createdAt_idx" ON "GatewayPaymentAttempt"("restaurantId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "GatewayPaymentAttempt" ADD CONSTRAINT "GatewayPaymentAttempt_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "GatewayPaymentAttempt" ADD CONSTRAINT "GatewayPaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "GatewayRefundAttempt" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "gatewayAttemptId" TEXT,
    "amountPaise" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "providerRefundId" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GatewayRefundAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GatewayRefundAttempt_restaurantId_idempotencyKey_key" ON "GatewayRefundAttempt"("restaurantId", "idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "GatewayRefundAttempt_restaurantId_providerRefundId_key" ON "GatewayRefundAttempt"("restaurantId", "providerRefundId");
CREATE INDEX IF NOT EXISTS "GatewayRefundAttempt_paymentId_idx" ON "GatewayRefundAttempt"("paymentId");

DO $$ BEGIN
  ALTER TABLE "GatewayRefundAttempt" ADD CONSTRAINT "GatewayRefundAttempt_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

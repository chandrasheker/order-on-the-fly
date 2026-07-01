-- Demo pack: one-time 7-day trial per tenant
ALTER TABLE "Tenant" ADD COLUMN "demoPackUsedAt" DATETIME;
ALTER TABLE "Tenant" ADD COLUMN "demoExpiresAt" DATETIME;

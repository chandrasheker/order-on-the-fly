CREATE TABLE IF NOT EXISTS "HostSlug" (
    "slug" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "restaurantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HostSlug_pkey" PRIMARY KEY ("slug")
);

CREATE TABLE IF NOT EXISTS "TenantAdmin" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "authVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TenantAdmin_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TenantAdmin" ADD COLUMN IF NOT EXISTS "authVersion" INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HostSlug_tenantId_fkey'
  ) THEN
    ALTER TABLE "HostSlug"
      ADD CONSTRAINT "HostSlug_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HostSlug_restaurantId_fkey'
  ) THEN
    ALTER TABLE "HostSlug"
      ADD CONSTRAINT "HostSlug_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TenantAdmin_tenantId_fkey'
  ) THEN
    ALTER TABLE "TenantAdmin"
      ADD CONSTRAINT "TenantAdmin_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "HostSlug_tenantId_kind_idx" ON "HostSlug"("tenantId", "kind");
CREATE INDEX IF NOT EXISTS "HostSlug_restaurantId_idx" ON "HostSlug"("restaurantId");
CREATE UNIQUE INDEX IF NOT EXISTS "TenantAdmin_tenantId_email_key" ON "TenantAdmin"("tenantId", "email");
CREATE INDEX IF NOT EXISTS "TenantAdmin_email_idx" ON "TenantAdmin"("email");

DELETE FROM "HostSlug"
WHERE "kind" = 'tenant_hub'
  AND "tenantId" IN (
    SELECT t."id" FROM "Tenant" t
    WHERE (SELECT COUNT(*) FROM "Restaurant" r WHERE r."tenantId" = t."id") = 1
  );

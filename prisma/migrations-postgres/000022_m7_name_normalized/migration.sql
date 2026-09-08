-- M7: PostgreSQL parity for Tenant/Restaurant normalized-name uniqueness.
-- Canonical meaning matches runtime canonicalizeName: trim, collapse whitespace, lowercase.

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "nameNormalized" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "nameNormalized" TEXT NOT NULL DEFAULT '';

UPDATE "Tenant"
SET "nameNormalized" = lower(trim(regexp_replace("name", '\s+', ' ', 'g')));

UPDATE "Restaurant"
SET "nameNormalized" = lower(trim(regexp_replace("name", '\s+', ' ', 'g')));

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_nameNormalized_key" ON "Tenant"("nameNormalized");
CREATE UNIQUE INDEX IF NOT EXISTS "Restaurant_tenantId_nameNormalized_key" ON "Restaurant"("tenantId", "nameNormalized");

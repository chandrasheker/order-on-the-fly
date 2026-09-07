-- AlterTable
ALTER TABLE "TenantAdmin" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;

-- Existing-data correction: single-restaurant tenants must not keep a dedicated tenant_hub lease.
DELETE FROM "HostSlug"
WHERE "kind" = 'tenant_hub'
  AND "tenantId" IN (
    SELECT t."id" FROM "Tenant" t
    WHERE (SELECT COUNT(*) FROM "Restaurant" r WHERE r."tenantId" = t."id") = 1
  );

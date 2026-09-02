-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "nameNormalized" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN "nameNormalized" TEXT NOT NULL DEFAULT '';

UPDATE "Tenant" SET "nameNormalized" = lower(trim(replace(replace(replace("name", char(9), ' '), char(10), ' '), char(13), ' ')));
UPDATE "Restaurant" SET "nameNormalized" = lower(trim(replace(replace(replace("name", char(9), ' '), char(10), ' '), char(13), ' ')));
UPDATE "Tenant" SET "nameNormalized" = replace("nameNormalized", '  ', ' ') WHERE "nameNormalized" LIKE '%  %';
UPDATE "Tenant" SET "nameNormalized" = replace("nameNormalized", '  ', ' ') WHERE "nameNormalized" LIKE '%  %';
UPDATE "Restaurant" SET "nameNormalized" = replace("nameNormalized", '  ', ' ') WHERE "nameNormalized" LIKE '%  %';
UPDATE "Restaurant" SET "nameNormalized" = replace("nameNormalized", '  ', ' ') WHERE "nameNormalized" LIKE '%  %';

-- CreateTable
CREATE TABLE "HostSlug" (
    "slug" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "restaurantId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HostSlug_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HostSlug_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TenantAdmin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TenantAdmin_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "HostSlug" ("slug", "kind", "tenantId", "restaurantId", "createdAt", "updatedAt")
SELECT "slug", 'restaurant', "tenantId", "id", "createdAt", "createdAt"
FROM "Restaurant"
WHERE "tenantId" IS NOT NULL;

INSERT INTO "HostSlug" ("slug", "kind", "tenantId", "restaurantId", "createdAt", "updatedAt")
SELECT t."slug", 'tenant_hub', t."id", NULL, t."createdAt", t."updatedAt"
FROM "Tenant" t
WHERE (
  (SELECT COUNT(*) FROM "Restaurant" r WHERE r."tenantId" = t."id") > 1
  OR (
    (SELECT COUNT(*) FROM "Restaurant" r WHERE r."tenantId" = t."id") = 1
    AND (SELECT r."slug" FROM "Restaurant" r WHERE r."tenantId" = t."id" LIMIT 1) != t."slug"
  )
)
AND NOT EXISTS (SELECT 1 FROM "HostSlug" h WHERE h."slug" = t."slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_nameNormalized_key" ON "Tenant"("nameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_tenantId_nameNormalized_key" ON "Restaurant"("tenantId", "nameNormalized");

-- CreateIndex
CREATE INDEX "HostSlug_tenantId_kind_idx" ON "HostSlug"("tenantId", "kind");

-- CreateIndex
CREATE INDEX "HostSlug_restaurantId_idx" ON "HostSlug"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantAdmin_tenantId_email_key" ON "TenantAdmin"("tenantId", "email");

-- CreateIndex
CREATE INDEX "TenantAdmin_email_idx" ON "TenantAdmin"("email");

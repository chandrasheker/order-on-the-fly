ALTER TABLE "Tenant" ADD COLUMN "isEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Restaurant" ADD COLUMN "isEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "StaffSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tenantId" TEXT,
    "role" TEXT NOT NULL,
    "loginAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logoutAt" DATETIME,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    CONSTRAINT "StaffSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StaffSession_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "StaffSession_restaurantId_logoutAt_lastSeenAt_idx" ON "StaffSession"("restaurantId", "logoutAt", "lastSeenAt");
CREATE INDEX "StaffSession_tenantId_logoutAt_lastSeenAt_idx" ON "StaffSession"("tenantId", "logoutAt", "lastSeenAt");
CREATE INDEX "StaffSession_userId_logoutAt_idx" ON "StaffSession"("userId", "logoutAt");

CREATE TABLE "LoginAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "platformAdminId" TEXT,
    "tenantId" TEXT,
    "restaurantId" TEXT,
    "role" TEXT,
    "failureReason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "LoginAuditLog_tenantId_createdAt_idx" ON "LoginAuditLog"("tenantId", "createdAt");
CREATE INDEX "LoginAuditLog_restaurantId_createdAt_idx" ON "LoginAuditLog"("restaurantId", "createdAt");
CREATE INDEX "LoginAuditLog_kind_createdAt_idx" ON "LoginAuditLog"("kind", "createdAt");
CREATE INDEX "LoginAuditLog_email_createdAt_idx" ON "LoginAuditLog"("email", "createdAt");

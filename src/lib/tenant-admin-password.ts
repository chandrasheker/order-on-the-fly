import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { assertPlatformPasswordPolicy } from "@/lib/password-policy";
import { AUDIT_ACTION, AUDIT_ACTOR_TYPE, AUDIT_CATEGORY } from "@/platform/forensics/constants";
import { appendPlatformAuditEventInTx } from "@/platform/forensics/platform-audit-service";

export { assertPlatformPasswordPolicy } from "@/lib/password-policy";

export async function resetTenantAdminPassword(input: {
  tenantId: string;
  tenantAdminId: string;
  newPassword: string;
  actorPlatformAdminId: string;
}) {
  const tenantId = String(input.tenantId ?? "").trim();
  const tenantAdminId = String(input.tenantAdminId ?? "").trim();
  const newPassword = String(input.newPassword ?? "");
  if (!tenantId || !tenantAdminId) {
    throw new Error("Tenant administrator not found");
  }
  assertPlatformPasswordPolicy(newPassword);

  const passwordHash = await hashPassword(newPassword);

  return prisma.$transaction(async (tx) => {
    const admin = await tx.tenantAdmin.findUnique({
      where: { id: tenantAdminId },
      select: { id: true, tenantId: true, email: true, name: true },
    });
    if (!admin || admin.tenantId !== tenantId) {
      throw new Error("Tenant administrator not found");
    }

    const updated = await tx.tenantAdmin.update({
      where: { id: admin.id },
      data: {
        passwordHash,
        authVersion: { increment: 1 },
      },
      select: { id: true, name: true, email: true, tenantId: true },
    });

    await appendPlatformAuditEventInTx(tx, {
      category: AUDIT_CATEGORY.PLATFORM,
      action: AUDIT_ACTION.TENANT_ADMIN_PASSWORD_RESET,
      actorType: AUDIT_ACTOR_TYPE.PLATFORM_ADMIN,
      actorId: input.actorPlatformAdminId,
      tenantId: admin.tenantId,
      resourceType: "TenantAdmin",
      resourceId: admin.id,
      metadata: {
        tenantId: admin.tenantId,
        tenantAdminId: admin.id,
        tenantAdminEmail: admin.email,
        actorPlatformAdminId: input.actorPlatformAdminId,
      },
    });

    return updated;
  });
}

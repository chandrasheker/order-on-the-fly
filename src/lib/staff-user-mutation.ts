import type { Prisma, Role } from "@/generated/prisma/client";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/platform/forensics/constants";
import { appendPlatformAuditEventInTx, type AuditTx } from "@/platform/forensics/platform-audit-service";
import { auditStaffSnapshot } from "@/platform/forensics/snapshots";
import { setForensicResource } from "@/platform/forensics/request-context";

export async function applyStaffUserMutationInTx(
  tx: AuditTx & Pick<Prisma.TransactionClient, "user">,
  params: {
    userId: string;
    existing: { id: string; name: string; email: string; role: Role; restaurantId: string };
    data: { name?: string; email?: string; passwordHash?: string; role?: Role };
  },
) {
  const user = await tx.user.update({
    where: { id: params.userId },
    data: params.data,
    include: { restaurant: { select: { id: true, name: true, slug: true } } },
  });
  const before = auditStaffSnapshot(params.existing);
  const after = auditStaffSnapshot(user);
  setForensicResource({ type: "User", id: user.id, label: user.name });
  await appendPlatformAuditEventInTx(tx, {
    category: AUDIT_CATEGORY.STAFF,
    action: AUDIT_ACTION.STAFF_UPDATED,
    restaurantId: user.restaurantId,
    resourceType: "User",
    resourceId: user.id,
    resourceLabel: user.name,
    before,
    after,
    metadata: {
      fields: Object.keys(params.data).map((key) => (key === "passwordHash" ? "passwordChanged" : key)),
      passwordChanged: Boolean(params.data.passwordHash),
    },
  });
  if (params.data.role && params.data.role !== params.existing.role) {
    await appendPlatformAuditEventInTx(tx, {
      category: AUDIT_CATEGORY.STAFF,
      action: AUDIT_ACTION.STAFF_ROLE_CHANGED,
      restaurantId: user.restaurantId,
      resourceType: "User",
      resourceId: user.id,
      resourceLabel: user.name,
      before: { role: params.existing.role },
      after: { role: user.role },
    });
  }
  return user;
}

import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/lib/feature-flags";
import type { AuditActionType, Role } from "@/generated/prisma/client";
import bcrypt from "bcryptjs";

const MANAGER_ROLES: Role[] = ["OWNER", "MANAGER"];

export async function recordAuditLog(params: {
  restaurantId: string;
  actionType: AuditActionType;
  entityId?: string;
  reason?: string;
  payload?: unknown;
  actorUserId?: string;
  actorName?: string;
  approvedByUserId?: string;
  approvedByName?: string;
  requiresApproval?: boolean;
}) {
  if (!(await isFeatureEnabled(params.restaurantId, "audit_log"))) return null;

  return prisma.auditLog.create({
    data: {
      restaurantId: params.restaurantId,
      actionType: params.actionType,
      entityId: params.entityId,
      reason: params.reason,
      payload: params.payload ? JSON.stringify(params.payload) : null,
      actorUserId: params.actorUserId,
      actorName: params.actorName,
      approvedByUserId: params.approvedByUserId,
      approvedByName: params.approvedByName,
      requiresApproval: params.requiresApproval ?? false,
      approvedAt: params.approvedByUserId ? new Date() : null,
    },
  });
}

export async function verifyManagerApproval(params: {
  restaurantId: string;
  approverUserId: string;
  approverPassword: string;
}) {
  const user = await prisma.user.findFirst({
    where: {
      id: params.approverUserId,
      restaurantId: params.restaurantId,
      role: { in: MANAGER_ROLES },
    },
  });
  if (!user) return { ok: false as const, error: "Manager approval required" };
  const valid = await bcrypt.compare(params.approverPassword, user.passwordHash);
  if (!valid) return { ok: false as const, error: "Invalid manager password" };
  return { ok: true as const, user };
}

export function roleRequiresRejectApproval(role: Role) {
  return role === "COOK" || role === "SERVER";
}

export async function listAuditLogs(restaurantId: string, limit = 100) {
  return prisma.auditLog.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/client";

export type LoginAuditKind = "STAFF" | "PLATFORM_ADMIN";

export type RecordLoginAuditInput = {
  kind: LoginAuditKind;
  success: boolean;
  email: string;
  userId?: string | null;
  platformAdminId?: string | null;
  tenantId?: string | null;
  restaurantId?: string | null;
  role?: Role | string | null;
  failureReason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export function requestClientMeta(req: { headers: Headers }) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const userAgent = req.headers.get("user-agent");
  return { ipAddress: ip, userAgent: userAgent?.slice(0, 512) ?? null };
}

export async function recordLoginAudit(input: RecordLoginAuditInput) {
  return prisma.loginAuditLog.create({
    data: {
      kind: input.kind,
      success: input.success,
      email: input.email.toLowerCase(),
      userId: input.userId ?? null,
      platformAdminId: input.platformAdminId ?? null,
      tenantId: input.tenantId ?? null,
      restaurantId: input.restaurantId ?? null,
      role: input.role ? String(input.role) : null,
      failureReason: input.failureReason ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}

export async function listLoginAuditLogs(params: {
  tenantId?: string;
  restaurantId?: string;
  kind?: LoginAuditKind;
  limit?: number;
}) {
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 500);
  return prisma.loginAuditLog.findMany({
    where: {
      ...(params.tenantId ? { tenantId: params.tenantId } : {}),
      ...(params.restaurantId ? { restaurantId: params.restaurantId } : {}),
      ...(params.kind ? { kind: params.kind } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

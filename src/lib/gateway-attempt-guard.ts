import { prisma } from "@/lib/prisma";
import { ACTIVE_GATEWAY_ATTEMPT_STATUSES } from "@/lib/gateway-constants";

export async function findActiveGatewayAttempt(orderId: string) {
  return prisma.gatewayPaymentAttempt.findFirst({
    where: {
      orderId,
      status: { in: [...ACTIVE_GATEWAY_ATTEMPT_STATUSES] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
  });
}

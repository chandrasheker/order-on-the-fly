import { prisma } from "@/lib/prisma";

export async function expireStaleRewards(restaurantId?: string) {
  const now = new Date();
  const result = await prisma.reward.updateMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: now },
      ...(restaurantId ? { restaurantId } : {}),
    },
    data: { status: "EXPIRED" },
  });
  return result.count;
}

export { REWARD_DISCLAIMER, REWARD_VALIDITY_HOURS, rewardExpiresAt, formatRewardExpiry } from "@/lib/reward-constants";

import { getRedis } from "@/lib/redis";

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
};

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const redis = await getRedis();
  const now = Date.now();
  const resetAt = now + windowSec * 1000;

  if (redis) {
    const redisKey = `rl:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.expire(redisKey, windowSec);
    const ttlKey = redisKey;
    void ttlKey;
    return {
      ok: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt,
    };
  }

  const bucket = memoryBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt };
  }

  bucket.count += 1;
  return {
    ok: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

export function rateLimitKey(prefix: string, id: string, restaurantId?: string) {
  return restaurantId ? `${prefix}:restaurant:${restaurantId}:${id}` : `${prefix}:${id}`;
}

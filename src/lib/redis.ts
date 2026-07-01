import { logWarn } from "@/lib/logger";

type RedisClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, ttl?: number): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
};

let client: RedisClient | null = null;
let initAttempted = false;

export async function getRedis(): Promise<RedisClient | null> {
  if (initAttempted) return client;
  initAttempted = true;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  try {
    const ioredis = await import("ioredis");
    const Redis = ioredis.default ?? ioredis;
    client = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true }) as unknown as RedisClient;
    await (client as unknown as { connect?: () => Promise<void> }).connect?.();
    return client;
  } catch (err) {
    logWarn("redis", "Redis unavailable — using in-memory fallbacks", {
      error: err instanceof Error ? err.message : String(err),
    });
    client = null;
    return null;
  }
}

export function isRedisConfigured() {
  return Boolean(process.env.REDIS_URL);
}

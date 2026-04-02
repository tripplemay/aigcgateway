// channels Redis 缓存 + 分布式锁 singleflight
// 独立文件避免 Next.js route export 限制

import { getRedis } from "@/lib/redis";

const CACHE_KEY = "cache:admin:channels";
const LOCK_KEY = "cache:admin:channels:lock";
const CACHE_TTL = 30; // seconds
const LOCK_TTL = 10; // seconds

export async function getCachedChannels(): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    return await redis.get(CACHE_KEY);
  } catch {
    return null;
  }
}

export async function setCachedChannels(json: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  redis.set(CACHE_KEY, json, "EX", CACHE_TTL).catch(() => {});
}

/**
 * 尝试获取分布式锁。
 * 返回 true 表示获取成功（调用方负责查 DB 并写缓存），
 * 返回 false 表示其他 worker 正在查询。
 */
export async function acquireLock(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true; // 无 Redis 时不锁，直接查
  try {
    const result = await redis.set(LOCK_KEY, "1", "EX", LOCK_TTL, "NX");
    return result === "OK";
  } catch {
    return true; // 锁失败也放行
  }
}

export async function releaseLock(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  redis.del(LOCK_KEY).catch(() => {});
}

/**
 * 未获取到锁时，等待缓存出现（最多重试 3 次，每次 100ms）。
 * 仍无缓存则返回 null，调用方应兜底查 DB。
 */
export async function waitForCache(): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) return cached;
    } catch {
      // continue
    }
  }
  return null;
}

export async function invalidateChannelsCache(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  redis.del(CACHE_KEY).catch(() => {});
}

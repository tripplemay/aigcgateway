/**
 * models:list:* 缓存失效辅助
 *
 * 在任何写入 Model / ModelAlias / Channel / AliasModelLink 的路径上调用，
 * 确保 /v1/models 的 Redis 缓存不会返回陈旧数据。
 */

import { getRedis } from "@/lib/redis";

const MODELS_LIST_KEYS = [
  "models:list",
  "models:list:TEXT",
  "models:list:IMAGE",
  "models:list:VIDEO",
  "models:list:AUDIO",
] as const;

export function invalidateModelsListCache(): void {
  const redis = getRedis();
  if (!redis) return;
  redis.del(...MODELS_LIST_KEYS).catch(() => {});
}

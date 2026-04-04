/**
 * Redis 客户端单例
 *
 * - 启动时若 REDIS_URL 已配，立即建连并追踪状态
 * - getRedis() 只在连接就绪时返回实例，否则返回 null（降级走 DB）
 * - 连接断开后自动重连（ioredis 默认行为），重连成功后恢复可用
 */

import Redis from "ioredis";

let redis: Redis | null = null;
let ready = false;

function createRedis(): void {
  const url = process.env.REDIS_URL;
  if (!url) return;

  try {
    const client = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: false, // 立即建连
      retryStrategy(times) {
        // 指数退避，最长 30 秒
        return Math.min(times * 500, 30_000);
      },
    });

    client.on("ready", () => {
      ready = true;
      console.log("[redis] connected");
    });

    client.on("error", (err) => {
      if (ready) console.error("[redis] error:", err.message);
      ready = false;
    });

    client.on("close", () => {
      ready = false;
    });

    redis = client;
  } catch {
    redis = null;
    ready = false;
  }
}

// 模块加载时即初始化（仅执行一次）
createRedis();

/**
 * 获取 Redis 客户端。仅在连接就绪时返回实例，否则返回 null。
 */
export function getRedis(): Redis | null {
  return ready ? redis : null;
}

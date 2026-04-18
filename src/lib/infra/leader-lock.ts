/**
 * BL-SEC-INFRA-GUARD F-IG-02 — Redis-backed leader lock.
 *
 * One process at a time runs a scheduled job (health scheduler, model-sync).
 * A Redis SET NX EX owns the lock; the holder heartbeats to refresh TTL; on
 * holder death, another replica acquires within TTL seconds.
 *
 * ## No fallback
 *
 * fix round 1 removed the previous in-process fallback. The old pattern
 * acquired a local boolean when Redis was down at startup, then tried to
 * heartbeat against Redis once it came up — which produced the race the
 * Evaluator caught: both replicas fallback-acquired, then both lost
 * leadership when Redis heartbeat found no matching key.
 *
 * New rule: Redis MUST be ready before acquire; heartbeat and acquire must
 * use the same source. instrumentation.ts calls waitForRedisReady(5000)
 * before acquiring; if that fails, the node is marked "scheduler disabled"
 * and no schedulers run. This keeps acquire/heartbeat semantics consistent
 * through the lock's lifetime.
 */

import { randomUUID } from "crypto";
import { getRedis } from "@/lib/redis";

const KEY_PREFIX = "leader-lock:";

// Per-process owner token — cheaper than regenerating per call and makes
// heartbeat/release idempotent against the same acquirer.
const processToken = randomUUID();

function fullKey(key: string): string {
  return `${KEY_PREFIX}${key}`;
}

/**
 * Try to acquire the named lock. Returns true iff the caller now owns it.
 * Returns false when Redis is not ready — callers MUST check and skip
 * starting the scheduled job. Call waitForRedisReady() first to ensure
 * Redis is up before relying on this.
 */
export async function acquireLeaderLock(key: string, ttlSeconds: number): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    console.warn(
      `[leader-lock] Redis not ready — cannot acquire "${key}". Callers must check waitForRedisReady() first.`,
    );
    return false;
  }

  const result = await redis.set(fullKey(key), processToken, "EX", ttlSeconds, "NX");
  return result === "OK";
}

/**
 * Refresh the lock's TTL iff we still own it. Returns false when Redis is
 * unavailable OR when another process now holds the key — either way the
 * caller should stop running the scheduled job.
 */
export async function heartbeatLock(key: string, ttlSeconds: number): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  // CAS: only refresh when the stored token matches ours.
  const script = `
    if redis.call('GET', KEYS[1]) == ARGV[1] then
      return redis.call('EXPIRE', KEYS[1], ARGV[2])
    else
      return 0
    end
  `;
  const result = (await redis.eval(script, 1, fullKey(key), processToken, ttlSeconds)) as number;
  return result === 1;
}

/**
 * Release the lock iff we own it. Safe to call even when we don't (no-op).
 * Also a no-op when Redis is unavailable.
 */
export async function releaseLeaderLock(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const script = `
    if redis.call('GET', KEYS[1]) == ARGV[1] then
      return redis.call('DEL', KEYS[1])
    else
      return 0
    end
  `;
  await redis.eval(script, 1, fullKey(key), processToken);
}

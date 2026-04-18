/**
 * BL-SEC-INFRA-GUARD F-IG-02 — Redis-backed leader lock.
 *
 * Purpose: across multiple app replicas, exactly one process holds the lock
 * and runs a scheduled job (health-scheduler, model-sync). Heartbeat refreshes
 * the TTL so the job can run indefinitely; if the holder dies, another
 * replica can acquire the lock within TTL seconds.
 *
 * Redis unavailable → fall back to a per-process boolean. Production
 * deploys run Redis, and the current deployment is still single-replica,
 * so the fallback keeps single-node dev / failover paths working at the
 * cost of losing cross-node mutual exclusion (warn logged).
 */

import { randomUUID } from "crypto";
import { getRedis } from "@/lib/redis";

const KEY_PREFIX = "leader-lock:";

// Per-process owner token — cheaper than regenerating per call and makes
// heartbeat/release idempotent against the same acquirer.
const processToken = randomUUID();

// Fallback state: set of locks owned by *this* process when Redis is down.
const localLocks = new Set<string>();

function fullKey(key: string): string {
  return `${KEY_PREFIX}${key}`;
}

/**
 * Try to acquire the named lock. Returns true iff the caller now owns it.
 * Uses Redis SET NX EX atomically. Without Redis, falls back to a per-
 * process set (warns; assumes single-replica deploy).
 */
export async function acquireLeaderLock(key: string, ttlSeconds: number): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    if (localLocks.has(key)) return false;
    localLocks.add(key);
    console.warn(
      `[leader-lock] Redis unavailable — acquired "${key}" via in-process fallback (no cross-replica safety)`,
    );
    return true;
  }

  const result = await redis.set(fullKey(key), processToken, "EX", ttlSeconds, "NX");
  return result === "OK";
}

/**
 * Refresh the lock's TTL iff we still own it. Returns true on success, false
 * if the lock is missing or held by someone else (the caller should stop
 * running the scheduled job).
 */
export async function heartbeatLock(key: string, ttlSeconds: number): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    return localLocks.has(key);
  }

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
 */
export async function releaseLeaderLock(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    localLocks.delete(key);
    return;
  }

  const script = `
    if redis.call('GET', KEYS[1]) == ARGV[1] then
      return redis.call('DEL', KEYS[1])
    else
      return 0
    end
  `;
  await redis.eval(script, 1, fullKey(key), processToken);
}

// Test-only: reset in-process fallback state.
export function __resetLocalLocksForTest(): void {
  localLocks.clear();
}

/**
 * F-RR2-02: short-lived "channel cooldown" set kept in Redis.
 *
 * When a channel fails mid-request (429 / 401 / 402 / 5xx / timeout),
 * withFailover writes the channel id here with a 300 s TTL. The next
 * routeByAlias call reads the set and de-prioritizes (NOT removes)
 * these channels so the next request doesn't keep paying the failure
 * tax on the same broken channel.
 *
 * Design choices:
 *   - Redis is best-effort. If it's unreachable we log and move on —
 *     the gateway must keep serving traffic, just without the
 *     cooldown optimization.
 *   - We never delete the key; it expires on its own. Simpler and
 *     matches the spec's "300s cool-off" contract.
 */

import { getRedis } from "@/lib/redis";

const TTL_SECONDS = 300;
const KEY_PREFIX = "channel:cooldown:";

function keyFor(channelId: string): string {
  return `${KEY_PREFIX}${channelId}`;
}

/**
 * Mark a channel as cooling down. Safe to call even when Redis is
 * unavailable — failures are logged and swallowed so the caller's
 * request path is never affected.
 */
export async function markChannelCooldown(
  channelId: string,
  reason: string,
): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    console.warn(
      `[cooldown] Redis unavailable — skipping cooldown mark for channel=${channelId} reason=${reason}`,
    );
    return;
  }
  try {
    const payload = `${reason}:${new Date().toISOString()}`;
    await redis.set(keyFor(channelId), payload, "EX", TTL_SECONDS);
  } catch (err) {
    console.warn(
      `[cooldown] failed to mark cooldown for channel=${channelId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Batch-check which of the given channel ids are currently cooling
 * down. Returns an empty Set on any error (fail-open) so router
 * sorting falls back to its previous behaviour instead of erroring.
 */
export async function getCooldownChannelIds(
  channelIds: string[],
): Promise<Set<string>> {
  const result = new Set<string>();
  if (channelIds.length === 0) return result;
  const redis = getRedis();
  if (!redis) return result;
  try {
    const keys = channelIds.map(keyFor);
    const values = await redis.mget(...keys);
    values.forEach((v, idx) => {
      if (v != null) result.add(channelIds[idx]);
    });
  } catch (err) {
    console.warn(
      `[cooldown] failed to batch-check cooldown: ${err instanceof Error ? err.message : String(err)}`,
    );
    return new Set<string>();
  }
  return result;
}

// Exported only for tests.
export const __testing = { TTL_SECONDS, KEY_PREFIX, keyFor };

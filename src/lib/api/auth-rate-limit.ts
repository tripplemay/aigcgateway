/**
 * BL-SEC-POLISH F-SP-01 — auth endpoint rate limiter.
 *
 * Two complementary sliding windows defend login/register from credential
 * stuffing and brute force:
 *
 *   - IP bucket:      10 requests / minute / IP.
 *   - Account bucket:  5 requests / minute / email (login only — register has
 *                      no "account" identity until after the POST, so IP is
 *                      the only bucket there).
 *
 * Implementation uses the same atomic ZREMRANGEBYSCORE + ZCARD + ZADD EVAL
 * script as rate-limit.ts rpmCheck, sharing the Redis primitive to avoid
 * TOCTOU. If Redis is not reachable, the limiter fails open (allows the
 * request) — consistent with rest of the rate-limit surface.
 */
import { getRedis } from "../redis";

const WINDOW_SEC = 60;
const TTL_SEC = 120;
const IP_LIMIT = 10;
const ACCOUNT_LIMIT = 5;

// Atomic sliding window: trim expired entries, count remaining, either ZADD
// or reject. Mirror of rate-limit.RPM_CHECK_LUA.
const AUTH_RATE_LUA = `
local key = KEYS[1]
local window_start = tonumber(ARGV[1])
local member = ARGV[2]
local score = tonumber(ARGV[3])
local limit = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])
redis.call('ZREMRANGEBYSCORE', key, 0, window_start)
local count = redis.call('ZCARD', key)
if count >= limit then
  return {0, count}
end
redis.call('ZADD', key, score, member)
redis.call('EXPIRE', key, ttl)
return {1, count + 1}
`;

export interface AuthRateCheckResult {
  allowed: boolean;
  limit: number;
  count: number;
  scope: "ip" | "account" | "none";
}

async function checkBucket(
  key: string,
  limit: number,
  nowSec: number,
): Promise<{ allowed: boolean; count: number }> {
  const redis = getRedis();
  if (!redis) return { allowed: true, count: 0 }; // fail-open when Redis down
  const windowStart = nowSec - WINDOW_SEC;
  const member = `${nowSec}:${Math.random().toString(36).slice(2, 8)}`;
  try {
    const res = (await redis.eval(
      AUTH_RATE_LUA,
      1,
      key,
      windowStart.toString(),
      member,
      nowSec.toString(),
      limit.toString(),
      TTL_SEC.toString(),
    )) as [number, number];
    const [allowed, count] = res;
    return { allowed: allowed === 1, count };
  } catch {
    return { allowed: true, count: 0 };
  }
}

/**
 * Check both IP and (optionally) account buckets. First one to reject wins —
 * the caller returns 429 with scope so the client can see which dimension
 * tripped.
 */
export async function checkAuthRateLimit(params: {
  ip: string | null;
  email?: string | null;
  route: "login" | "register";
}): Promise<AuthRateCheckResult> {
  const nowSec = Math.floor(Date.now() / 1000);
  const ip = (params.ip ?? "unknown").toLowerCase();

  const ipRes = await checkBucket(`auth:rl:ip:${params.route}:${ip}`, IP_LIMIT, nowSec);
  if (!ipRes.allowed) {
    return { allowed: false, limit: IP_LIMIT, count: ipRes.count, scope: "ip" };
  }

  // Account bucket only makes sense post-identity — login has the email
  // in the request body. register has no pre-existing account identity,
  // so IP is the sole bucket.
  if (params.email && params.route === "login") {
    const email = params.email.trim().toLowerCase();
    const acctRes = await checkBucket(
      `auth:rl:account:${email}`,
      ACCOUNT_LIMIT,
      nowSec,
    );
    if (!acctRes.allowed) {
      return {
        allowed: false,
        limit: ACCOUNT_LIMIT,
        count: acctRes.count,
        scope: "account",
      };
    }
  }

  return { allowed: true, limit: IP_LIMIT, count: ipRes.count, scope: "none" };
}

export function extractClientIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

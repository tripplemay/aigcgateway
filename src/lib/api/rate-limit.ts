/**
 * 限流中间件 (RATE-LIMIT batch)
 *
 * Layers — every call goes through every applicable check:
 *   RPM (sliding 60s) — API key / user / project, whichever is tightest
 *   TPM (sliding 60s) — read historical tokens against project limit (F-RL-01)
 *   BURST (sliding  5s) — per-identifier burst cap (F-RL-03)
 *   SPEND (sliding 60s) — per-user USD per minute (F-RL-04)
 *
 * Defaults live in SystemConfig (F-RL-06) with env + hardcoded fallback so
 * the gateway keeps working even before the table is seeded.
 *
 * Every violation writes a SystemLog(category=RATE_LIMIT) entry (F-RL-07).
 * Redis outages degrade open (fail-safe).
 */

import { getRedis } from "../redis";
import { errorResponse } from "./errors";
import { prisma } from "@/lib/prisma";
import type { Project } from "@prisma/client";
import type { NextResponse } from "next/server";
import { sendNotification } from "@/lib/notifications/dispatcher";

// ============================================================
// Defaults (with SystemConfig override)
// ============================================================

interface GlobalDefaults {
  rpm: number;
  tpm: number;
  imageRpm: number;
  burstCount: number;
  burstWindowSec: number;
  spendPerMin: number;
  keyRpm: number;
  userRpm: number;
}

const DEFAULT_KEYS = [
  "GLOBAL_DEFAULT_RPM",
  "GLOBAL_DEFAULT_TPM",
  "GLOBAL_DEFAULT_IMAGE_RPM",
  "GLOBAL_DEFAULT_BURST_COUNT",
  "GLOBAL_DEFAULT_BURST_WINDOW_SEC",
  "GLOBAL_DEFAULT_SPEND_PER_MIN",
  "GLOBAL_DEFAULT_KEY_RPM",
  "GLOBAL_DEFAULT_USER_RPM",
] as const;

let cachedDefaults: { value: GlobalDefaults; expiresAt: number } | null = null;
const DEFAULTS_TTL_MS = 15_000;

function hardcodedDefaults(): GlobalDefaults {
  return {
    rpm: Number(process.env.DEFAULT_RPM ?? 60),
    tpm: Number(process.env.DEFAULT_TPM ?? 100_000),
    imageRpm: Number(process.env.DEFAULT_IMAGE_RPM ?? 10),
    burstCount: Number(process.env.DEFAULT_BURST_COUNT ?? 20),
    burstWindowSec: Number(process.env.DEFAULT_BURST_WINDOW_SEC ?? 5),
    spendPerMin: Number(process.env.DEFAULT_SPEND_PER_MIN ?? 1),
    keyRpm: Number(process.env.DEFAULT_KEY_RPM ?? 30),
    userRpm: Number(process.env.DEFAULT_USER_RPM ?? 60),
  };
}

async function loadGlobalDefaults(): Promise<GlobalDefaults> {
  const now = Date.now();
  if (cachedDefaults && cachedDefaults.expiresAt > now) return cachedDefaults.value;

  const base = hardcodedDefaults();
  try {
    const rows = await prisma.systemConfig.findMany({
      where: { key: { in: [...DEFAULT_KEYS] } },
      select: { key: true, value: true },
    });
    const map = new Map(rows.map((r) => [r.key, Number(r.value)]));
    const merged: GlobalDefaults = {
      rpm: map.get("GLOBAL_DEFAULT_RPM") ?? base.rpm,
      tpm: map.get("GLOBAL_DEFAULT_TPM") ?? base.tpm,
      imageRpm: map.get("GLOBAL_DEFAULT_IMAGE_RPM") ?? base.imageRpm,
      burstCount: map.get("GLOBAL_DEFAULT_BURST_COUNT") ?? base.burstCount,
      burstWindowSec: map.get("GLOBAL_DEFAULT_BURST_WINDOW_SEC") ?? base.burstWindowSec,
      spendPerMin: map.get("GLOBAL_DEFAULT_SPEND_PER_MIN") ?? base.spendPerMin,
      keyRpm: map.get("GLOBAL_DEFAULT_KEY_RPM") ?? base.keyRpm,
      userRpm: map.get("GLOBAL_DEFAULT_USER_RPM") ?? base.userRpm,
    };
    cachedDefaults = { value: merged, expiresAt: now + DEFAULTS_TTL_MS };
    return merged;
  } catch {
    return base;
  }
}

export function clearRateLimitDefaultsCache(): void {
  cachedDefaults = null;
}

// ============================================================
// Project limits
// ============================================================

interface ProjectLimits {
  rpm: number;
  tpm: number;
  imageRpm: number;
  spendPerMin: number | null;
}

async function getProjectLimits(project: Pick<Project, "rateLimit">): Promise<ProjectLimits> {
  const defaults = await loadGlobalDefaults();
  const custom = project.rateLimit as {
    rpm?: number;
    tpm?: number;
    imageRpm?: number;
    spendPerMin?: number;
  } | null;
  return {
    rpm: custom?.rpm ?? defaults.rpm,
    tpm: custom?.tpm ?? defaults.tpm,
    imageRpm: custom?.imageRpm ?? defaults.imageRpm,
    spendPerMin: custom?.spendPerMin ?? null,
  };
}

// ============================================================
// Types
// ============================================================

type RateLimitResult =
  | { ok: true; headers: Record<string, string>; rateLimitKey?: string; rateLimitMember?: string }
  | { ok: false; error: NextResponse };

interface RateLimitContext {
  apiKeyId?: string | null;
  userId?: string | null;
}

// ============================================================
// SystemLog helper
// ============================================================

async function logRateLimitEvent(params: {
  scope: "rpm" | "tpm" | "burst" | "spend";
  dimension: "key" | "user" | "project";
  identifier: string;
  limit: number;
  actual: number;
}): Promise<void> {
  try {
    await prisma.systemLog.create({
      data: {
        category: "RATE_LIMIT",
        level: "WARN",
        message: `${params.scope}_limit_exceeded on ${params.dimension}=${params.identifier}`,
        detail: {
          scope: params.scope,
          dimension: params.dimension,
          identifier: params.identifier,
          limit: params.limit,
          actual: params.actual,
          at: new Date().toISOString(),
        },
      },
    });
  } catch {
    /* best-effort audit log */
  }
}

// ============================================================
// RPM sliding-window primitive
// ============================================================

// BL-INFRA-RESILIENCE H-26: atomic sliding-window RPM via Lua EVAL.
// The previous pipeline (zremrangebyscore + zcard + zadd + expire) was not
// a MULTI transaction — concurrent callers could read `count` before each
// other's ZADD, letting the window overflow. Lua `redis.call` executes
// serially within a single Redis command, closing the TOCTOU race.
//
// Returns { allowed, count }:
//   - allowed = 1 → caller added, current count = `count`
//   - allowed = 0 → caller rejected (count already at limit), nothing added
const RPM_CHECK_LUA = `
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

async function rpmCheck(
  redisKey: string,
  limit: number,
  now: number,
): Promise<
  { ok: true; member: string; currentCount: number } | { ok: false; currentCount: number }
> {
  const redis = getRedis();
  if (!redis) return { ok: true, member: "", currentCount: 0 };
  const windowStart = now - 60;
  const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;
  try {
    const result = (await redis.eval(
      RPM_CHECK_LUA,
      1,
      redisKey,
      windowStart.toString(),
      member,
      now.toString(),
      limit.toString(),
      "120",
    )) as [number, number];
    const [allowed, count] = result;
    if (allowed === 1) {
      return { ok: true, member, currentCount: count };
    }
    return { ok: false, currentCount: count };
  } catch {
    return { ok: true, member: "", currentCount: 0 };
  }
}

// ============================================================
// checkRateLimit — entry point
// ============================================================

export async function checkRateLimit(
  project: Pick<Project, "id" | "rateLimit">,
  type: "text" | "image",
  keyRateLimit?: number | null,
  ctx?: RateLimitContext,
): Promise<RateLimitResult> {
  const redis = getRedis();
  const limits = await getProjectLimits(project);
  const defaults = await loadGlobalDefaults();
  const projectLimit = type === "image" ? limits.imageRpm : limits.rpm;
  const resolvedKeyLimit =
    keyRateLimit != null
      ? Math.min(keyRateLimit, projectLimit)
      : Math.min(defaults.keyRpm, projectLimit);

  const now = Math.floor(Date.now() / 1000);
  const resetAt = now + 60;

  if (!redis) {
    return { ok: true, headers: rateLimitHeaders(projectLimit, projectLimit - 1, resetAt) };
  }

  // ── F-RL-02: three-layer RPM (project → user → key) ──
  // Start with the widest window so the tightest wins and we audit correctly.
  const projectKey = `rl:${type === "image" ? "img" : "rpm"}:project:${project.id}`;
  const projectResult = await rpmCheck(projectKey, projectLimit, now);
  if (!projectResult.ok) {
    logRateLimitEvent({
      scope: "rpm",
      dimension: "project",
      identifier: project.id,
      limit: projectLimit,
      actual: projectResult.currentCount,
    });
    return { ok: false, error: buildRateLimitError("rpm", "project", projectLimit, resetAt) };
  }

  const userCommit: { key: string; member: string }[] = [
    { key: projectKey, member: projectResult.member },
  ];

  if (ctx?.userId) {
    const userKey = `rl:rpm:user:${ctx.userId}`;
    const userResult = await rpmCheck(userKey, defaults.userRpm, now);
    if (!userResult.ok) {
      // Rollback prior layer before returning.
      for (const c of userCommit) await rollbackRateLimit(c.key, c.member);
      logRateLimitEvent({
        scope: "rpm",
        dimension: "user",
        identifier: ctx.userId,
        limit: defaults.userRpm,
        actual: userResult.currentCount,
      });
      return { ok: false, error: buildRateLimitError("rpm", "user", defaults.userRpm, resetAt) };
    }
    userCommit.push({ key: userKey, member: userResult.member });
  }

  if (ctx?.apiKeyId) {
    const apiKey = `rl:rpm:key:${ctx.apiKeyId}`;
    const keyResult = await rpmCheck(apiKey, resolvedKeyLimit, now);
    if (!keyResult.ok) {
      for (const c of userCommit) await rollbackRateLimit(c.key, c.member);
      logRateLimitEvent({
        scope: "rpm",
        dimension: "key",
        identifier: ctx.apiKeyId,
        limit: resolvedKeyLimit,
        actual: keyResult.currentCount,
      });
      return { ok: false, error: buildRateLimitError("rpm", "key", resolvedKeyLimit, resetAt) };
    }
    userCommit.push({ key: apiKey, member: keyResult.member });
  }

  // ── F-RL-03: burst protection (5s / 20 req on a per-project identifier) ──
  if ((process.env.BURST_PROTECTION_ENABLED ?? "true").toLowerCase() !== "false") {
    const burstKey = `rl:burst:${project.id}`;
    const burstWindow = defaults.burstWindowSec;
    const burstCount = defaults.burstCount;
    try {
      const pipe = redis.pipeline();
      pipe.zremrangebyscore(burstKey, 0, now - burstWindow);
      pipe.zcard(burstKey);
      pipe.zadd(burstKey, now.toString(), `${now}:${Math.random().toString(36).slice(2, 8)}`);
      pipe.expire(burstKey, burstWindow * 2);
      const results = await pipe.exec();
      const count = (results?.[1]?.[1] as number) ?? 0;
      if (count >= burstCount) {
        for (const c of userCommit) await rollbackRateLimit(c.key, c.member);
        logRateLimitEvent({
          scope: "burst",
          dimension: "project",
          identifier: project.id,
          limit: burstCount,
          actual: count,
        });
        return {
          ok: false,
          error: errorResponse(
            429,
            "burst_limit_exceeded",
            `Burst limit exceeded (${count} / ${burstCount} in ${burstWindow}s). Please retry after 30 seconds.`,
            {
              retryAfterSeconds: 30,
              headers: { "Retry-After": "30" },
            },
          ),
        };
      }
    } catch {
      /* degrade open */
    }
  }

  // Primary commit slot is still the project-level sorted set so
  // rollbackRateLimit() callers behave the same as before.
  return {
    ok: true,
    headers: rateLimitHeaders(
      projectLimit,
      Math.max(0, projectLimit - projectResult.currentCount - 1),
      resetAt,
    ),
    rateLimitKey: projectKey,
    rateLimitMember: projectResult.member,
  };
}

// ============================================================
// F-RL-01: checkTokenLimit (TPM read)
// ============================================================

export async function checkTokenLimit(
  project: Pick<Project, "id" | "rateLimit">,
): Promise<{ ok: true } | { ok: false; error: NextResponse }> {
  const redis = getRedis();
  if (!redis) return { ok: true };
  const limits = await getProjectLimits(project);
  const key = `rl:tpm:${project.id}`;
  const now = Math.floor(Date.now() / 1000);
  try {
    await redis.zremrangebyscore(key, 0, now - 60);
    const members = await redis.zrange(key, 0, -1);
    let tokensUsed = 0;
    for (const m of members) {
      const parts = m.split(":");
      const n = Number(parts[1]);
      if (Number.isFinite(n)) tokensUsed += n;
    }
    if (tokensUsed >= limits.tpm) {
      logRateLimitEvent({
        scope: "tpm",
        dimension: "project",
        identifier: project.id,
        limit: limits.tpm,
        actual: tokensUsed,
      });
      return {
        ok: false,
        error: errorResponse(
          429,
          "token_rate_limit_exceeded",
          `Token rate limit exceeded (${tokensUsed} / ${limits.tpm} tokens/min). Please retry after 60 seconds.`,
          {
            retryAfterSeconds: 60,
            headers: { "Retry-After": "60" },
          },
        ),
      };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

// ============================================================
// F-RL-04: spending rate protection
// ============================================================

export async function recordSpending(userId: string, amountUsd: number): Promise<void> {
  if (!userId || amountUsd <= 0) return;
  const redis = getRedis();
  if (!redis) return;
  const minuteEpoch = Math.floor(Date.now() / 60_000);
  const key = `rl:spend:${userId}:${minuteEpoch}`;
  try {
    await redis.incrbyfloat(key, amountUsd);
    await redis.expire(key, 180);
  } catch {
    /* best-effort */
  }
}

export async function checkSpendingRate(
  userId: string,
  userLimitUsd?: number | null,
): Promise<{ ok: true } | { ok: false; error: NextResponse }> {
  if (!userId) return { ok: true };
  const redis = getRedis();
  if (!redis) return { ok: true };
  const defaults = await loadGlobalDefaults();
  const limit = userLimitUsd ?? defaults.spendPerMin;
  if (limit <= 0) return { ok: true };
  const minuteEpoch = Math.floor(Date.now() / 60_000);
  const key = `rl:spend:${userId}:${minuteEpoch}`;
  try {
    const raw = await redis.get(key);
    const spent = raw ? Number(raw) : 0;
    if (spent >= limit) {
      logRateLimitEvent({
        scope: "spend",
        dimension: "user",
        identifier: userId,
        limit,
        actual: spent,
      });
      // F-UA-03: fire SPENDING_RATE_EXCEEDED notification, 1-hour dedup
      void (async () => {
        try {
          const dedupKey = `alert:spend_rate:${userId}`;
          const set = await redis.set(dedupKey, "1", "EX", 3600, "NX");
          if (set) {
            await sendNotification(userId, "SPENDING_RATE_EXCEEDED", {
              spent,
              limit,
              windowMinutes: 1,
              blockedAt: new Date().toISOString(),
            });
          }
        } catch {
          /* best-effort */
        }
      })();
      return {
        ok: false,
        error: errorResponse(
          429,
          "spend_rate_exceeded",
          `Spending rate limit exceeded (spent $${spent.toFixed(4)} of $${limit.toFixed(2)}/min). Please retry after 60 seconds.`,
          {
            retryAfterSeconds: 60,
            headers: { "Retry-After": "60" },
          },
        ),
      };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

// ============================================================
// Rollback + headers + errors
// ============================================================

export async function rollbackRateLimit(
  rateLimitKey: string,
  rateLimitMember: string,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.zrem(rateLimitKey, rateLimitMember);
  } catch {
    /* ignore */
  }
}

export async function recordTokenUsage(
  project: Pick<Project, "id" | "rateLimit">,
  tokens: number,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const now = Math.floor(Date.now() / 1000);
  const key = `rl:tpm:${project.id}`;
  try {
    const pipe = redis.pipeline();
    pipe.zremrangebyscore(key, 0, now - 60);
    pipe.zadd(key, now.toString(), `${now}:${tokens}:${Math.random().toString(36).slice(2, 8)}`);
    pipe.expire(key, 120);
    await pipe.exec();
  } catch {
    /* ignore */
  }
}

function rateLimitHeaders(limit: number, remaining: number, reset: number): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(reset),
  };
}

function buildRateLimitError(
  scope: "rpm" | "tpm" | "burst" | "spend",
  dimension: "key" | "user" | "project",
  limit: number,
  resetAt: number,
): NextResponse {
  const retryAfter = scope === "burst" ? 30 : 60;
  return errorResponse(
    429,
    "rate_limit_exceeded",
    `${scope.toUpperCase()} limit exceeded on ${dimension} (limit=${limit}). Please retry after ${retryAfter} seconds.`,
    {
      retryAfterSeconds: retryAfter,
      headers: {
        ...rateLimitHeaders(limit, 0, resetAt),
        "Retry-After": String(retryAfter),
      },
    },
  );
}

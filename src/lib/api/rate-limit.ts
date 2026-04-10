/**
 * 限流中间件
 *
 * Redis 滑动窗口计数器，RPM / TPM / 图片 RPM 三维度
 * 无 Redis 时降级放行
 */

import { getRedis } from "../redis";
import { errorResponse } from "./errors";
import type { Project } from "@prisma/client";
import type { NextResponse } from "next/server";

interface RateLimitConfig {
  rpm: number;
  tpm: number;
  imageRpm: number;
}

function getProjectLimits(project: Pick<Project, "rateLimit">): RateLimitConfig {
  const custom = project.rateLimit as { rpm?: number; tpm?: number; imageRpm?: number } | null;
  return {
    rpm: custom?.rpm ?? Number(process.env.DEFAULT_RPM ?? 60),
    tpm: custom?.tpm ?? Number(process.env.DEFAULT_TPM ?? 100000),
    imageRpm: custom?.imageRpm ?? Number(process.env.DEFAULT_IMAGE_RPM ?? 10),
  };
}

type RateLimitResult =
  | { ok: true; headers: Record<string, string> }
  | { ok: false; error: NextResponse };

/**
 * 检查 RPM 限流
 * @param keyRateLimit — Key 级 RPM 覆盖（只能收紧，不能超过项目级）
 */
export async function checkRateLimit(
  project: Pick<Project, "id" | "rateLimit">,
  type: "text" | "image",
  keyRateLimit?: number | null,
): Promise<RateLimitResult> {
  const redis = getRedis();
  const limits = getProjectLimits(project);
  const projectLimit = type === "image" ? limits.imageRpm : limits.rpm;
  // Key 级 RPM 只能收紧（Math.min），不能超过项目级
  const limit = keyRateLimit != null ? Math.min(keyRateLimit, projectLimit) : projectLimit;

  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - 60;
  const resetAt = now + 60;

  // 无 Redis → 降级放行
  if (!redis) {
    return {
      ok: true,
      headers: rateLimitHeaders(limit, limit - 1, resetAt),
    };
  }

  const key = `rl:${type === "image" ? "img" : "rpm"}:${project.id}`;

  try {
    // 滑动窗口：ZREMRANGEBYSCORE + ZCARD + ZADD
    const pipe = redis.pipeline();
    pipe.zremrangebyscore(key, 0, windowStart);
    pipe.zcard(key);
    pipe.zadd(key, now.toString(), `${now}:${Math.random().toString(36).slice(2, 8)}`);
    pipe.expire(key, 120);

    const results = await pipe.exec();
    const currentCount = (results?.[1]?.[1] as number) ?? 0;
    const remaining = Math.max(0, limit - currentCount - 1);

    if (currentCount >= limit) {
      // 移除刚加的
      pipe.zremrangebyscore(key, now, now);
      const retryAfter = 60;
      return {
        ok: false,
        error: errorResponse(
          429,
          "rate_limit_exceeded",
          `Rate limit exceeded. Please retry after ${retryAfter} seconds.`,
          {
            headers: {
              ...rateLimitHeaders(limit, 0, resetAt),
              "Retry-After": String(retryAfter),
            },
          },
        ),
      };
    }

    return {
      ok: true,
      headers: rateLimitHeaders(limit, remaining, resetAt),
    };
  } catch {
    // Redis 错误 → 降级放行
    return {
      ok: true,
      headers: rateLimitHeaders(limit, limit - 1, resetAt),
    };
  }
}

/**
 * 记录 token 用量（TPM 检查）— 异步，不阻塞
 */
export async function recordTokenUsage(
  project: Pick<Project, "id" | "rateLimit">,
  tokens: number,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const limits = getProjectLimits(project);
  const now = Math.floor(Date.now() / 1000);
  const key = `rl:tpm:${project.id}`;

  try {
    const pipe = redis.pipeline();
    pipe.zremrangebyscore(key, 0, now - 60);
    // 每个 token 记一条
    pipe.zadd(key, now.toString(), `${now}:${tokens}:${Math.random().toString(36).slice(2, 8)}`);
    pipe.expire(key, 120);
    await pipe.exec();
  } catch {
    // 忽略
  }
}

function rateLimitHeaders(limit: number, remaining: number, reset: number): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(reset),
  };
}

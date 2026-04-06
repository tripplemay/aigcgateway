export const dynamic = "force-dynamic";
/**
 * GET /v1/models
 *
 * 返回所有有 ACTIVE channel 的 Model + sellPrice + capabilities
 * 支持 ?modality=text|image 筛选
 *
 * 鉴权策略（可选）：
 * - 无 Bearer token → 公开访问，返回模型列表
 * - 有 Bearer token → 走完整鉴权链（revoked/expired/permissions/IP）
 *   projectInfo=false 时返回 403
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth-middleware";
import { getRedis } from "@/lib/redis";

const CACHE_TTL = 120; // seconds
const LOCK_TTL = 10; // seconds

/** 查 DB + 构造响应 JSON 字符串 */
async function queryModelsJSON(modalityFilter: string | undefined): Promise<string> {
  const models = await prisma.model.findMany({
    where: {
      enabled: true,
      channels: { some: { status: "ACTIVE" } },
      ...(modalityFilter
        ? { modality: modalityFilter as "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" }
        : {}),
    },
    select: {
      name: true,
      displayName: true,
      modality: true,
      maxTokens: true,
      contextWindow: true,
      capabilities: true,
      description: true,
      channels: {
        where: { status: "ACTIVE" },
        orderBy: { priority: "asc" },
        take: 1,
        select: {
          sellPrice: true,
          provider: { select: { displayName: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const data = models.map((model) => {
    const channel = model.channels[0];
    const sellPrice = channel?.sellPrice as Record<string, unknown> | undefined;
    const providerName = channel?.provider?.displayName ?? null;
    const capabilities = (model.capabilities as Record<string, unknown>) ?? {};

    const pricing: Record<string, unknown> = {};
    if (sellPrice) {
      if (sellPrice.unit === "token") {
        pricing.input_per_1m = sellPrice.inputPer1M;
        pricing.output_per_1m = sellPrice.outputPer1M;
        pricing.unit = "token";
        pricing.currency = "USD";
      } else if (sellPrice.unit === "call") {
        pricing.per_call = sellPrice.perCall;
        pricing.unit = "call";
        pricing.currency = "USD";
      }
    }

    return {
      id: model.name,
      object: "model" as const,
      display_name: model.displayName,
      modality: model.modality.toLowerCase(),
      ...(providerName ? { provider_name: providerName } : {}),
      ...(model.contextWindow ? { context_window: model.contextWindow } : {}),
      ...(model.maxTokens ? { max_output_tokens: model.maxTokens } : {}),
      pricing,
      capabilities,
      ...(model.description ? { description: model.description } : {}),
    };
  });

  return JSON.stringify({ object: "list", data });
}

/** 带 Redis 分布式锁的 singleflight 缓存读取 */
async function getModelsWithCache(
  cacheKey: string,
  modalityFilter: string | undefined,
): Promise<string> {
  const redis = getRedis();
  const lockKey = `${cacheKey}:lock`;

  // 1. 读缓存
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return cached;
    } catch {
      // fallthrough
    }
  }

  // 无 Redis 则直接查 DB
  if (!redis) return queryModelsJSON(modalityFilter);

  // 2. 抢锁
  try {
    const locked = await redis.set(lockKey, "1", "EX", LOCK_TTL, "NX");
    if (locked === "OK") {
      try {
        const json = await queryModelsJSON(modalityFilter);
        await redis.set(cacheKey, json, "EX", CACHE_TTL);
        return json;
      } finally {
        redis.del(lockKey).catch(() => {});
      }
    }
  } catch {
    // 锁失败，fallthrough 到等待
  }

  // 3. 未抢到锁，等待缓存出现
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return cached;
    } catch {
      // continue
    }
  }

  // 4. 兜底：直接查 DB
  return queryModelsJSON(modalityFilter);
}

export async function GET(request: Request) {
  // 可选鉴权：有 Bearer token 才校验
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const auth = await authenticateApiKey(request);
    if (!auth.ok) return auth.error;
  }

  const url = new URL(request.url);
  const modalityFilter = url.searchParams.get("modality")?.toUpperCase();
  const cacheKey = modalityFilter ? `models:list:${modalityFilter}` : "models:list";

  const json = await getModelsWithCache(cacheKey, modalityFilter);
  return new NextResponse(json, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

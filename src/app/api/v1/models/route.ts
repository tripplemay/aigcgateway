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
type ModelCapabilities = Record<string, boolean | undefined>;

const CACHE_TTL = 120; // seconds
const LOCK_TTL = 10; // seconds

/** 查 DB + 构造响应 JSON 字符串（返回别名列表） */
async function queryModelsJSON(modalityFilter: string | undefined): Promise<string> {
  const aliases = await prisma.modelAlias.findMany({
    where: {
      enabled: true,
      ...(modalityFilter
        ? { modality: modalityFilter as "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" }
        : {}),
    },
    include: {
      models: {
        include: {
          model: {
            include: {
              channels: {
                where: { status: "ACTIVE" },
                orderBy: { priority: "asc" },
                select: {
                  sellPrice: true,
                  priority: true,
                  healthChecks: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: { result: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { alias: "asc" },
  });

  const data = aliases
    .map((alias) => {
      // Collect all healthy channels across linked models
      const allChannels = alias.models
        .flatMap((link) => link.model.channels)
        .filter((ch) => {
          const lastCheck = ch.healthChecks[0];
          return !lastCheck || lastCheck.result !== "FAIL";
        })
        .sort((a, b) => a.priority - b.priority);

      // Skip aliases with no healthy channels
      if (allChannels.length === 0) return null;

      // Pricing: prefer ModelAlias.sellPrice, fallback to best channel
      const bestChannel = allChannels[0];
      const aliasSellPrice = alias.sellPrice as Record<string, unknown> | null;
      const sellPrice =
        aliasSellPrice && Object.keys(aliasSellPrice).length > 0
          ? aliasSellPrice
          : (bestChannel?.sellPrice as Record<string, unknown> | undefined);
      const capabilities = (alias.capabilities as ModelCapabilities | null) ?? {};

      const pricing: Record<string, unknown> = {};
      if (sellPrice) {
        // Infer unit for legacy data missing it (Layer 4 — read-time compat)
        const unit =
          sellPrice.unit ??
          (sellPrice.inputPer1M !== undefined || sellPrice.outputPer1M !== undefined
            ? "token"
            : sellPrice.perCall !== undefined
              ? "call"
              : undefined);

        if (unit === "token") {
          pricing.input_per_1m = sellPrice.inputPer1M;
          pricing.output_per_1m = sellPrice.outputPer1M;
          pricing.unit = "token";
          pricing.currency = "USD";
        } else if (unit === "call") {
          pricing.per_call = sellPrice.perCall;
          pricing.unit = "call";
          pricing.currency = "USD";
        }
      }

      return {
        id: alias.alias,
        object: "model" as const,
        ...(alias.brand ? { brand: alias.brand } : {}),
        modality: alias.modality.toLowerCase(),
        ...(alias.contextWindow ? { context_window: alias.contextWindow } : {}),
        ...(alias.maxTokens ? { max_output_tokens: alias.maxTokens } : {}),
        pricing,
        capabilities,
        ...(alias.description ? { description: alias.description } : {}),
      };
    })
    .filter(Boolean);

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

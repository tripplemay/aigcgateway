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

// In-process singleflight：缓存 miss 时只允许 1 个 DB 查询，其余复用同一个 Promise
// 当前 PM2 单实例部署有效；多实例时需改为 Redis 分布式锁
const inflightRequests = new Map<string, Promise<string>>();

/** 查 DB + 构造响应 JSON 字符串 */
async function queryModelsJSON(modalityFilter: string | undefined): Promise<string> {
  const models = await prisma.model.findMany({
    where: {
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

/** 带 singleflight 的缓存读取 */
async function getModelsWithSingleflight(
  cacheKey: string,
  modalityFilter: string | undefined,
): Promise<string> {
  const redis = getRedis();

  // 1. 读缓存
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return cached;
    } catch {
      // Redis 读失败则 fallthrough
    }
  }

  // 2. 已有 inflight 请求，复用同一个 Promise
  const existing = inflightRequests.get(cacheKey);
  if (existing) return existing;

  // 3. 发起新的 DB 查询
  const promise = queryModelsJSON(modalityFilter)
    .then((json) => {
      if (redis) {
        redis.set(cacheKey, json, "EX", CACHE_TTL).catch(() => {});
      }
      return json;
    })
    .finally(() => {
      inflightRequests.delete(cacheKey);
    });

  inflightRequests.set(cacheKey, promise);
  return promise;
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

  const json = await getModelsWithSingleflight(cacheKey, modalityFilter);
  return new NextResponse(json, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

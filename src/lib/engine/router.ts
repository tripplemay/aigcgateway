/**
 * 通道路由器
 *
 * alias → ModelAlias → AliasModelLink[] → Model[] → Channel(ACTIVE, priority ASC) → Provider + Config → Adapter
 */

import { prisma } from "@/lib/prisma";
import type { EngineAdapter, RouteResult } from "./types";
import { EngineError, ErrorCodes } from "./types";
import { OpenAICompatEngine } from "./openai-compat";
import { VolcengineAdapter } from "./adapters/volcengine";
import { SiliconFlowAdapter } from "./adapters/siliconflow";

// Adapter 单例缓存
const adapterCache = new Map<string, EngineAdapter>();

function getAdapter(adapterType: string): EngineAdapter {
  const cached = adapterCache.get(adapterType);
  if (cached) return cached;

  let adapter: EngineAdapter;
  switch (adapterType) {
    case "volcengine":
      adapter = new VolcengineAdapter();
      break;
    case "siliconflow":
      adapter = new SiliconFlowAdapter();
      break;
    case "openai-compat":
    default:
      adapter = new OpenAICompatEngine();
      break;
  }

  adapterCache.set(adapterType, adapter);
  return adapter;
}

/**
 * 通过别名路由到最优通道。
 * 别名 → 关联 Models → 所有 ACTIVE Channel → 按 priority 选最优（跳过健康检查 FAIL 的）
 */
export async function routeByAlias(aliasName: string): Promise<RouteResult> {
  const alias = await prisma.modelAlias.findUnique({
    where: { alias: aliasName, enabled: true },
    include: {
      models: {
        include: {
          model: {
            include: {
              channels: {
                where: { status: "ACTIVE" },
                orderBy: { priority: "asc" },
                include: {
                  provider: { include: { config: true } },
                  healthChecks: { orderBy: { createdAt: "desc" }, take: 1 },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!alias) {
    throw new EngineError(`Model "${aliasName}" not found`, ErrorCodes.MODEL_NOT_FOUND, 404);
  }

  // F-ACF-02: filter out links whose underlying Model.enabled=false to keep
  // alias-routing in lockstep with list_models (ghost model elimination).
  const candidateChannels = alias.models
    .filter((link) => link.model.enabled === true)
    .flatMap((link) =>
      link.model.channels.map((ch) => ({
        channel: ch,
        provider: ch.provider,
        config: ch.provider.config,
        model: link.model,
        healthFail: ch.healthChecks.length > 0 && ch.healthChecks[0].result === "FAIL",
      })),
    )
    .filter((c) => !c.healthFail && c.config != null)
    .sort((a, b) => a.channel.priority - b.channel.priority);

  if (candidateChannels.length === 0) {
    throw new EngineError(
      `No active channel available for "${aliasName}"`,
      ErrorCodes.CHANNEL_UNAVAILABLE,
      503,
    );
  }

  const best = candidateChannels[0];
  return {
    channel: best.channel,
    provider: best.provider,
    config: best.config!,
    model: best.model,
    alias,
  };
}

/**
 * 根据底层模型名路由（保留供内部使用，如健康检查）
 */
export async function routeByModelName(modelName: string): Promise<RouteResult> {
  const model = await prisma.model.findUnique({
    where: { name: modelName },
  });

  if (!model) {
    throw new EngineError(`Model "${modelName}" not found`, ErrorCodes.MODEL_NOT_FOUND, 404);
  }

  if (!model.enabled) {
    throw new EngineError(
      `Model "${modelName}" is not available. It may be disabled by the administrator.`,
      ErrorCodes.MODEL_NOT_AVAILABLE,
      403,
    );
  }

  const channel = await prisma.channel.findFirst({
    where: {
      modelId: model.id,
      status: "ACTIVE",
    },
    orderBy: { priority: "asc" },
    include: {
      provider: {
        include: { config: true },
      },
    },
  });

  if (!channel) {
    throw new EngineError(
      `No active channel available for model "${modelName}"`,
      ErrorCodes.CHANNEL_UNAVAILABLE,
      503,
    );
  }

  const { provider } = channel;
  const config = provider.config;

  if (!config) {
    throw new EngineError(
      `Provider "${provider.name}" has no config`,
      ErrorCodes.PROVIDER_ERROR,
      500,
    );
  }

  return { channel, provider, config, model };
}

/**
 * 获取路由结果对应的 Adapter
 */
export function getAdapterForRoute(route: RouteResult): EngineAdapter {
  return getAdapter(route.provider.adapterType);
}

/**
 * 一步到位：路由（通过别名） + 获取 Adapter
 */
export async function resolveEngine(aliasName: string): Promise<{
  route: RouteResult;
  adapter: EngineAdapter;
}> {
  const route = await routeByAlias(aliasName);
  const adapter = getAdapterForRoute(route);
  return { route, adapter };
}

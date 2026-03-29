/**
 * 通道路由器
 *
 * modelName → Model → Channel(ACTIVE, priority ASC) → Provider + Config → Adapter 实例
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
 * 根据模型名路由到最优通道
 */
export async function routeByModelName(modelName: string): Promise<RouteResult> {
  // 1. 查找模型
  const model = await prisma.model.findUnique({
    where: { name: modelName },
  });

  if (!model) {
    throw new EngineError(
      `Model "${modelName}" not found`,
      ErrorCodes.MODEL_NOT_FOUND,
      404,
    );
  }

  // 2. 查找活跃通道（按 priority ASC）
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
 * 一步到位：路由 + 获取 Adapter
 */
export async function resolveEngine(modelName: string): Promise<{
  route: RouteResult;
  adapter: EngineAdapter;
}> {
  const route = await routeByModelName(modelName);
  const adapter = getAdapterForRoute(route);
  return { route, adapter };
}

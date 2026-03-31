/**
 * 模型自动同步引擎
 *
 * 遍历 ACTIVE Provider → 通过专属 SyncAdapter 获取模型列表 → 对比数据库 → 新增/下架
 */

import { prisma } from "@/lib/prisma";
import { getConfigNumber } from "@/lib/config";
import type { SyncAdapter, SyncedModel, ProviderWithConfig } from "./adapters/base";
import type { ModelModality } from "@prisma/client";

// ── 适配器注册表 ──
import { openaiAdapter } from "./adapters/openai";
import { anthropicAdapter } from "./adapters/anthropic";
import { deepseekAdapter } from "./adapters/deepseek";
import { zhipuAdapter } from "./adapters/zhipu";
import { volcengineAdapter } from "./adapters/volcengine";
import { siliconflowAdapter } from "./adapters/siliconflow";
import { openrouterAdapter } from "./adapters/openrouter";

// ── 并发保护 ──
let syncInProgress = false;

const ADAPTERS: Record<string, SyncAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  deepseek: deepseekAdapter,
  zhipu: zhipuAdapter,
  volcengine: volcengineAdapter,
  siliconflow: siliconflowAdapter,
  openrouter: openrouterAdapter,
};

// ============================================================
// 同步结果类型
// ============================================================

export interface SyncResult {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  providers: ProviderSyncResult[];
  summary: {
    totalNewModels: number;
    totalNewChannels: number;
    totalDisabledChannels: number;
    totalFailedProviders: number;
  };
}

interface ProviderSyncResult {
  providerName: string;
  success: boolean;
  error?: string;
  newModels: string[];
  newChannels: string[];
  disabledChannels: string[];
  modelCount: number;
}

// ============================================================
// 定价辅助
// ============================================================

function buildCostPrice(model: SyncedModel) {
  if (model.modality === "IMAGE") {
    return { perCall: 0, unit: "call" };
  }
  return {
    inputPer1M: model.inputPricePerM ?? 0,
    outputPer1M: model.outputPricePerM ?? 0,
    unit: "token",
  };
}

function applySellMarkup(costPrice: Record<string, unknown>, markupRatio: number) {
  if (costPrice.unit === "call") {
    const perCall = (costPrice.perCall as number) ?? 0;
    return {
      perCall: +(perCall * markupRatio).toFixed(4),
      unit: "call",
    };
  }
  const inputPer1M = (costPrice.inputPer1M as number) ?? 0;
  const outputPer1M = (costPrice.outputPer1M as number) ?? 0;
  return {
    inputPer1M: +(inputPer1M * markupRatio).toFixed(4),
    outputPer1M: +(outputPer1M * markupRatio).toFixed(4),
    unit: "token",
  };
}

// ============================================================
// 跨服务商同模型去重映射
// ============================================================

/**
 * 已知的跨服务商同模型映射。
 * key = "openrouter 返回的 model ID", value = "直连服务商的 Model.name"
 *
 * OpenRouter 上的这些模型会创建 Channel 关联到已有的直连 Model，
 * 而不是创建重复的 Model。
 */
const CROSS_PROVIDER_MAP: Record<string, string> = {
  // OpenRouter ID → 直连 Model.name
  "openai/gpt-4o": "openai/gpt-4o",
  "openai/gpt-4o-mini": "openai/gpt-4o-mini",
  "openai/gpt-4.1": "openai/gpt-4.1",
  "openai/gpt-4.1-mini": "openai/gpt-4.1-mini",
  "openai/gpt-4.1-nano": "openai/gpt-4.1-nano",
  "openai/o3": "openai/o3",
  "openai/o3-mini": "openai/o3-mini",
  "openai/o4-mini": "openai/o4-mini",
  "anthropic/claude-opus-4-6": "anthropic/claude-opus-4-6",
  "anthropic/claude-sonnet-4-6": "anthropic/claude-sonnet-4-6",
  "anthropic/claude-haiku-4-5": "anthropic/claude-haiku-4-5",
  "deepseek/deepseek-chat": "deepseek/v3",
  "deepseek/deepseek-reasoner": "deepseek/reasoner",
};

/** 解析模型的最终 Model.name（处理跨服务商去重） */
function resolveModelName(syncedModel: SyncedModel, providerName: string): string {
  if (providerName === "openrouter") {
    const mapped = CROSS_PROVIDER_MAP[syncedModel.modelId];
    if (mapped) return mapped;
  }
  return syncedModel.name;
}

// ============================================================
// 核心同步逻辑
// ============================================================

async function syncProvider(
  provider: ProviderWithConfig,
  adapter: SyncAdapter,
  markupRatio: number,
): Promise<ProviderSyncResult> {
  const result: ProviderSyncResult = {
    providerName: provider.name,
    success: false,
    newModels: [],
    newChannels: [],
    disabledChannels: [],
    modelCount: 0,
  };

  try {
    // 1. 通过适配器获取模型列表
    const remoteModels = await adapter.fetchModels(provider);
    result.modelCount = remoteModels.length;

    // 2. 获取该 Provider 现有的所有 Channel（含 DISABLED，用于恢复）
    const existingChannels = await prisma.channel.findMany({
      where: { providerId: provider.id },
      include: { model: true },
    });

    const channelByRealModelId = new Map(existingChannels.map((ch) => [ch.realModelId, ch]));
    const remoteRealModelIds = new Set(remoteModels.map((m) => m.modelId));

    for (const remoteModel of remoteModels) {
      const existingChannel = channelByRealModelId.get(remoteModel.modelId);

      if (existingChannel) {
        const updateData: Record<string, unknown> = {};

        // 服务商仍返回该模型 → 恢复 DEGRADED/DISABLED 通道为 ACTIVE
        if (existingChannel.status !== "ACTIVE") {
          updateData.status = "ACTIVE";
        }

        // 更新 costPrice（仅 sellPriceLocked=false）
        if (!existingChannel.sellPriceLocked) {
          const costPrice = buildCostPrice(remoteModel);
          const sellPrice = applySellMarkup(costPrice, markupRatio);
          updateData.costPrice = costPrice;
          updateData.sellPrice = sellPrice;
        }

        if (Object.keys(updateData).length > 0) {
          await prisma.channel.update({
            where: { id: existingChannel.id },
            data: updateData,
          });
        }
        continue;
      }

      // 新模型：创建 Model（如果不存在）+ Channel
      const modelName = resolveModelName(remoteModel, provider.name);
      const model = await prisma.model.upsert({
        where: { name: modelName },
        update: {
          contextWindow: remoteModel.contextWindow ?? undefined,
          maxTokens: remoteModel.maxOutputTokens ?? undefined,
        },
        create: {
          name: modelName,
          displayName: remoteModel.displayName,
          modality: remoteModel.modality as ModelModality,
          contextWindow: remoteModel.contextWindow ?? null,
          maxTokens: remoteModel.maxOutputTokens ?? null,
        },
      });

      // 防重复：检查是否已有该 provider + model 的 channel（realModelId 可能变化过）
      const existingByModel = existingChannels.find((ch) => ch.modelId === model.id);
      if (existingByModel) {
        // 复用已有 channel：更新 realModelId + 恢复状态
        const updateData: Record<string, unknown> = {
          realModelId: remoteModel.modelId,
        };
        if (existingByModel.status !== "ACTIVE") {
          updateData.status = "ACTIVE";
        }
        if (!existingByModel.sellPriceLocked) {
          updateData.costPrice = buildCostPrice(remoteModel);
          updateData.sellPrice = applySellMarkup(
            updateData.costPrice as Record<string, unknown>,
            markupRatio,
          );
        }
        await prisma.channel.update({
          where: { id: existingByModel.id },
          data: updateData,
        });
        continue;
      }

      const costPrice = buildCostPrice(remoteModel);
      const sellPrice = applySellMarkup(costPrice, markupRatio);

      await prisma.channel.create({
        data: {
          providerId: provider.id,
          modelId: model.id,
          realModelId: remoteModel.modelId,
          priority: 1,
          costPrice,
          sellPrice,
          status: "ACTIVE",
        },
      });

      if (!existingChannels.some((ch) => ch.model.name === modelName)) {
        result.newModels.push(modelName);
      }
      result.newChannels.push(`${provider.name}/${remoteModel.modelId}`);
    }

    // 4. 下架处理：服务商不再返回的模型 → Channel DISABLED
    for (const channel of existingChannels) {
      if (channel.status !== "DISABLED" && !remoteRealModelIds.has(channel.realModelId)) {
        await prisma.channel.update({
          where: { id: channel.id },
          data: { status: "DISABLED" },
        });
        result.disabledChannels.push(`${provider.name}/${channel.realModelId}`);
      }
    }

    result.success = true;
  } catch (err) {
    result.error = err instanceof Error ? err.message : "Unknown error";
  }

  return result;
}

// ============================================================
// 公共入口
// ============================================================

export async function runModelSync(): Promise<SyncResult> {
  if (syncInProgress) {
    console.log("[model-sync] Sync already in progress, skipping");
    return {
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      providers: [],
      summary: {
        totalNewModels: 0,
        totalNewChannels: 0,
        totalDisabledChannels: 0,
        totalFailedProviders: 0,
      },
    };
  }
  syncInProgress = true;

  const startedAt = new Date();

  try {
    const markupRatio = await getConfigNumber("DEFAULT_MARKUP_RATIO", 1.2);

    const providers = await prisma.provider.findMany({
      where: { status: "ACTIVE" },
      include: { config: true },
    });

    // 逐个同步（串行，避免并发数据库冲突）
    const providerResults: ProviderSyncResult[] = [];
    for (const provider of providers) {
      const adapter = ADAPTERS[provider.name];
      if (!adapter) {
        providerResults.push({
          providerName: provider.name,
          success: false,
          error: `No sync adapter found for provider "${provider.name}"`,
          newModels: [],
          newChannels: [],
          disabledChannels: [],
          modelCount: 0,
        });
        continue;
      }

      const result = await syncProvider(provider, adapter, markupRatio);
      providerResults.push(result);
      console.log(
        `[model-sync] ${provider.name}: ${result.success ? "OK" : "FAIL"} ` +
          `(+${result.newChannels.length} new, -${result.disabledChannels.length} disabled)` +
          (result.error ? ` error: ${result.error}` : ""),
      );
    }

    const finishedAt = new Date();
    const syncResult: SyncResult = {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      providers: providerResults,
      summary: {
        totalNewModels: providerResults.reduce((sum, r) => sum + r.newModels.length, 0),
        totalNewChannels: providerResults.reduce((sum, r) => sum + r.newChannels.length, 0),
        totalDisabledChannels: providerResults.reduce(
          (sum, r) => sum + r.disabledChannels.length,
          0,
        ),
        totalFailedProviders: providerResults.filter((r) => !r.success).length,
      },
    };

    // 保存同步结果到 SystemConfig
    const { setConfig } = await import("@/lib/config");
    await setConfig("LAST_SYNC_RESULT", JSON.stringify(syncResult), "最近一次模型同步结果");
    await setConfig("LAST_SYNC_TIME", syncResult.finishedAt, "最近一次模型同步时间");

    return syncResult;
  } finally {
    syncInProgress = false;
  }
}

/**
 * 模型自动同步引擎
 *
 * 遍历 ACTIVE Provider → 获取模型列表 → 对比数据库 → 新增/下架
 */

import { prisma } from "@/lib/prisma";
import { getConfigNumber } from "@/lib/config";
import { fetchProviderModels, type SyncedModel } from "./provider-models";
import type { Provider, ProviderConfig, ModelModality } from "@prisma/client";

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
  if (model.pricing) {
    if (model.pricing.unit === "call") {
      return { perCall: model.pricing.perCall ?? 0, unit: "call" };
    }
    return {
      inputPer1M: model.pricing.inputPer1M ?? 0,
      outputPer1M: model.pricing.outputPer1M ?? 0,
      unit: "token",
    };
  }
  // 图片模型默认按次计费
  if (model.modality === "IMAGE") {
    return { perCall: 0, unit: "call" };
  }
  // 文本模型默认 token 计费，价格为 0（需运营手动补充）
  return { inputPer1M: 0, outputPer1M: 0, unit: "token" };
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
// 核心同步逻辑
// ============================================================

type ProviderWithConfig = Provider & { config: ProviderConfig | null };

async function syncProvider(
  provider: ProviderWithConfig,
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
    // 1. 获取服务商模型列表
    const remoteModels = await fetchProviderModels(provider);
    result.modelCount = remoteModels.length;

    // 2. 获取该 Provider 现有的所有 Channel（含 model 关系）
    const existingChannels = await prisma.channel.findMany({
      where: { providerId: provider.id },
      include: { model: true },
    });

    const existingRealModelIds = new Set(existingChannels.map((ch) => ch.realModelId));
    const remoteRealModelIds = new Set(remoteModels.map((m) => m.id));

    // 3. 新增模型
    for (const remoteModel of remoteModels) {
      if (existingRealModelIds.has(remoteModel.id)) {
        // 已存在的 channel，检查是否需要更新 costPrice（仅 sellPriceLocked=false 的）
        const existingChannel = existingChannels.find((ch) => ch.realModelId === remoteModel.id);
        if (existingChannel && remoteModel.pricing && !existingChannel.sellPriceLocked) {
          const costPrice = buildCostPrice(remoteModel);
          const sellPrice = applySellMarkup(costPrice, markupRatio);
          await prisma.channel.update({
            where: { id: existingChannel.id },
            data: { costPrice, sellPrice },
          });
        }
        continue;
      }

      // 新模型：创建 Model（如果不存在）+ Channel
      const modelName = remoteModel.name;
      const model = await prisma.model.upsert({
        where: { name: modelName },
        update: {
          contextWindow: remoteModel.contextWindow ?? undefined,
        },
        create: {
          name: modelName,
          displayName: remoteModel.displayName,
          modality: remoteModel.modality as ModelModality,
          contextWindow: remoteModel.contextWindow ?? null,
        },
      });

      const costPrice = buildCostPrice(remoteModel);
      const sellPrice = applySellMarkup(costPrice, markupRatio);

      await prisma.channel.create({
        data: {
          providerId: provider.id,
          modelId: model.id,
          realModelId: remoteModel.id,
          priority: 1,
          costPrice,
          sellPrice,
          status: "ACTIVE",
        },
      });

      if (!existingChannels.some((ch) => ch.model.name === modelName)) {
        result.newModels.push(modelName);
      }
      result.newChannels.push(`${provider.name}/${remoteModel.id}`);
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
  const startedAt = new Date();

  // 获取加价比例
  const markupRatio = await getConfigNumber("DEFAULT_MARKUP_RATIO", 1.2);

  // 获取所有 ACTIVE Provider 及其 Config
  const providers = await prisma.provider.findMany({
    where: { status: "ACTIVE" },
    include: { config: true },
  });

  // 逐个同步（串行，避免并发数据库冲突）
  const providerResults: ProviderSyncResult[] = [];
  for (const provider of providers) {
    const result = await syncProvider(provider, markupRatio);
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
      totalDisabledChannels: providerResults.reduce((sum, r) => sum + r.disabledChannels.length, 0),
      totalFailedProviders: providerResults.filter((r) => !r.success).length,
    },
  };

  // 保存同步结果到 SystemConfig
  const { setConfig } = await import("@/lib/config");
  await setConfig("LAST_SYNC_RESULT", JSON.stringify(syncResult), "最近一次模型同步结果");
  await setConfig("LAST_SYNC_TIME", syncResult.finishedAt, "最近一次模型同步时间");

  return syncResult;
}

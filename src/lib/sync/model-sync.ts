/**
 * 模型自动同步引擎 — 两层架构
 *
 * 第 1 层：/models API（自动，免费）
 * 第 2 层：AI 读服务商文档（自动，低成本，补全缺失数据）
 *
 * 数据合并优先级：
 * 1. /models API 返回 → 直接用
 * 2. AI 从文档提取 → 只补不覆盖
 * 3. 运营手动 pricingOverrides → 最高优先级
 * 4. sellPriceLocked=true → 永远不被覆盖
 * 5. 全都没有 → costPrice = 0
 */

import { prisma } from "@/lib/prisma";
import { getConfigNumber } from "@/lib/config";
// model-capabilities-fallback removed — capabilities now managed via Admin UI
import type {
  SyncAdapter,
  SyncedModel,
  ProviderWithConfig,
  PricingOverride,
} from "./adapters/base";

import { enrichFromDocs } from "./doc-enricher";
import type { ModelModality, Prisma } from "@prisma/client";

// ── 适配器注册表 ──
import { openaiAdapter } from "./adapters/openai";
import { anthropicAdapter } from "./adapters/anthropic";
import { deepseekAdapter } from "./adapters/deepseek";
import { zhipuAdapter } from "./adapters/zhipu";
import { volcengineAdapter } from "./adapters/volcengine";
import { siliconflowAdapter } from "./adapters/siliconflow";
import { openrouterAdapter } from "./adapters/openrouter";
// model-whitelist.ts removed — whitelist now managed via Model.enabled in DB

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
  apiModels: number;
  aiEnriched: number;
  overrides: number;
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
// 运营手动覆盖应用
// ============================================================

const EXCHANGE_RATE = parseFloat(process.env.EXCHANGE_RATE_CNY_TO_USD ?? "0.137");

function applyOverrides(
  models: SyncedModel[],
  config: { pricingOverrides?: unknown },
): { models: SyncedModel[]; count: number } {
  if (!config.pricingOverrides) return { models, count: 0 };

  const overrides = config.pricingOverrides as Record<string, PricingOverride>;
  let count = 0;

  const result = models.map((m) => {
    const override = overrides[m.modelId];
    if (!override) return m;

    count++;
    const updated = { ...m };

    if (override.inputPricePerM !== undefined) updated.inputPricePerM = override.inputPricePerM;
    if (override.outputPricePerM !== undefined) updated.outputPricePerM = override.outputPricePerM;
    if (override.inputPriceCNYPerM !== undefined && updated.inputPricePerM === undefined) {
      updated.inputPricePerM = +(override.inputPriceCNYPerM * EXCHANGE_RATE).toFixed(4);
    }
    if (override.outputPriceCNYPerM !== undefined && updated.outputPricePerM === undefined) {
      updated.outputPricePerM = +(override.outputPriceCNYPerM * EXCHANGE_RATE).toFixed(4);
    }
    if (override.contextWindow !== undefined) updated.contextWindow = override.contextWindow;
    if (override.maxOutputTokens !== undefined) updated.maxOutputTokens = override.maxOutputTokens;
    if (override.displayName !== undefined) updated.displayName = override.displayName;
    if (override.modality !== undefined) {
      updated.modality = override.modality === "image" ? "IMAGE" : "TEXT";
    }

    return updated;
  });

  return { models: result, count };
}

// ============================================================
// Canonical name 解析（查 ModelAlias 表）
// ============================================================

/**
 * 将 Provider 返回的 modelId 映射到 canonical name。
 * M1a 后 ModelAlias 不再持有 modelName，直接返回原始 modelId。
 * 后续 M1b 的 LLM 分类推断会在 sync 后自动挂载模型到别名。
 */
async function resolveCanonicalName(modelId: string): Promise<string> {
  return modelId;
}

// ============================================================
// 数据库 reconcile
// ============================================================

async function reconcile(
  provider: ProviderWithConfig,
  models: SyncedModel[],
  markupRatio: number,
): Promise<{ newModels: string[]; newChannels: string[]; disabledChannels: string[] }> {
  const newModels: string[] = [];
  const newChannels: string[] = [];
  const disabledChannels: string[] = [];

  // 去重：同一 Provider 返回的重复 modelId 只保留第一条
  const seen = new Set<string>();
  const dedupedModels = models.filter((m) => {
    if (seen.has(m.modelId)) return false;
    seen.add(m.modelId);
    return true;
  });
  if (dedupedModels.length < models.length) {
    console.log(
      `[model-sync] ${provider.name}: deduped ${models.length - dedupedModels.length} duplicate modelIds`,
    );
  }

  const existingChannels = await prisma.channel.findMany({
    where: { providerId: provider.id },
    include: { model: true },
  });

  const remoteRealModelIds = new Set(dedupedModels.map((m) => m.modelId));

  for (const remoteModel of dedupedModels) {
    const canonicalName = await resolveCanonicalName(remoteModel.modelId);

    // Model upsert — 按 canonical name，多 Provider 共享同一 Model
    const model = await prisma.model.upsert({
      where: { name: canonicalName },
      update: {
        // 只更新 contextWindow（如果 provider 返回了值）
        ...(remoteModel.contextWindow ? { contextWindow: remoteModel.contextWindow } : {}),
      },
      create: {
        name: canonicalName,
        displayName: remoteModel.displayName ?? canonicalName,
        modality: remoteModel.modality as ModelModality,
        contextWindow: remoteModel.contextWindow ?? null,
        maxTokens: remoteModel.maxOutputTokens ?? null,
        capabilities: {}, // 由管理员在 Admin UI 设置
        enabled: false, // 默认不启用
      },
    });

    // Channel upsert — 按 (providerId, modelId) 唯一约束
    const existingChannel = await prisma.channel.findUnique({
      where: { providerId_modelId: { providerId: provider.id, modelId: model.id } },
    });

    const costPrice = buildCostPrice(remoteModel);
    const sellPrice = applySellMarkup(costPrice, markupRatio);

    if (existingChannel) {
      const updateData: Record<string, unknown> = {
        realModelId: remoteModel.modelId,
      };
      if (existingChannel.status !== "ACTIVE") updateData.status = "ACTIVE";
      if (!existingChannel.sellPriceLocked) {
        updateData.costPrice = costPrice;
        updateData.sellPrice = sellPrice;
      }
      await prisma.channel.update({ where: { id: existingChannel.id }, data: updateData });
    } else {
      // 可观测性：新 Channel sellPrice 全为 0 时打印告警
      const sp = sellPrice as unknown as Record<string, number>;
      if ((sp.inputPer1M === 0 && sp.outputPer1M === 0) || sp.perCall === 0) {
        console.warn(
          `[model-sync] WARNING: zero sellPrice for new channel ${provider.name}/${remoteModel.modelId}`,
        );
      }

      await prisma.channel.create({
        data: {
          modelId: model.id,
          providerId: provider.id,
          realModelId: remoteModel.modelId,
          status: "ACTIVE",
          priority: 10, // 默认优先级，管理员可调
          costPrice: costPrice as unknown as Prisma.InputJsonValue,
          sellPrice: sellPrice as unknown as Prisma.InputJsonValue,
        },
      });
      newChannels.push(`${provider.name}/${remoteModel.modelId} → ${canonicalName}`);
    }

    // 记录新 Model
    if (!existingChannels.some((ch) => ch.model.name === canonicalName)) {
      newModels.push(canonicalName);
    }
  }

  // 下架：服务商不再返回的模型
  const toDisable = existingChannels.filter(
    (ch) => ch.status !== "DISABLED" && !remoteRealModelIds.has(ch.realModelId),
  );
  if (toDisable.length > 0) {
    await prisma.channel.updateMany({
      where: { id: { in: toDisable.map((ch) => ch.id) } },
      data: { status: "DISABLED" },
    });
    for (const ch of toDisable) {
      disabledChannels.push(`${provider.name}/${ch.realModelId}`);
    }
  }

  return { newModels, newChannels, disabledChannels };
}

// ============================================================
// 核心：两层同步 + reconcile
// ============================================================

async function syncProvider(
  provider: ProviderWithConfig,
  adapter: SyncAdapter,
  markupRatio: number,
): Promise<ProviderSyncResult> {
  const result: ProviderSyncResult = {
    providerName: provider.name,
    success: false,
    apiModels: 0,
    aiEnriched: 0,
    overrides: 0,
    newModels: [],
    newChannels: [],
    disabledChannels: [],
    modelCount: 0,
  };

  try {
    // ── 第 1 层：/models API ──
    let models: SyncedModel[] = [];
    try {
      models = await adapter.fetchModels(provider);
      result.apiModels = models.length;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.error = `API fetch failed: ${msg}`;
      console.log(`[model-sync] ${provider.name} Layer 1 failed: ${msg}`);
    }

    // ── 第 2 层：AI 读文档补充 ──
    if (provider.config) {
      try {
        const enrichResult = await enrichFromDocs(provider, provider.config, models);
        models = enrichResult.models;
        result.aiEnriched = enrichResult.aiEnriched;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[model-sync] ${provider.name} Layer 2 failed: ${msg}`);
        // 不中断，继续用第 1 层数据
      }
    }

    // ── 应用运营手动覆盖（如有）──
    if (provider.config?.pricingOverrides) {
      const overrideResult = applyOverrides(models, provider.config);
      models = overrideResult.models;
      result.overrides = overrideResult.count;
    }

    // ── 安全防护：API 返回空时保留现有数据 ──
    const existingChannelCount = await prisma.channel.count({
      where: { providerId: provider.id, status: { not: "DISABLED" } },
    });

    if (models.length === 0 && existingChannelCount > 0) {
      console.log(
        `[model-sync] ${provider.name}: SKIPPED reconcile — 0 models from API+AI but DB has ${existingChannelCount} active channels`,
      );
      result.modelCount = 0;
      result.success = true;
      return result;
    }

    if (existingChannelCount > 0 && models.length < existingChannelCount * 0.5) {
      console.log(
        `[model-sync] ${provider.name}: SKIPPED reconcile — model count ${models.length} < 50% of existing ${existingChannelCount}`,
      );
      result.modelCount = models.length;
      result.success = true;
      return result;
    }

    // ── 适配器 modality 过滤（过滤 EMBEDDING/RERANKING/AUDIO）──
    if (adapter.filterModel) {
      const before = models.length;
      models = models.filter((m) => adapter.filterModel!(m.modelId));
      if (before !== models.length) {
        console.log(
          `[model-sync] ${provider.name}: filtered ${before - models.length} non-whitelisted models from AI results`,
        );
      }
    }

    result.modelCount = models.length;

    // ── reconcile 入库 ──
    const dbResult = await reconcile(provider, models, markupRatio);
    result.newModels = dbResult.newModels;
    result.newChannels = dbResult.newChannels;
    result.disabledChannels = dbResult.disabledChannels;

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

    // 并行同步所有 provider（各 provider 独立，互不阻塞）
    const syncTasks = providers.map((provider) => {
      const adapter = ADAPTERS[provider.name];
      if (!adapter) {
        return Promise.resolve({
          providerName: provider.name,
          success: false,
          error: `No sync adapter found for provider "${provider.name}"`,
          apiModels: 0,
          aiEnriched: 0,
          overrides: 0,
          newModels: [],
          newChannels: [],
          disabledChannels: [],
          modelCount: 0,
        } as ProviderSyncResult);
      }
      return syncProvider(provider, adapter, markupRatio);
    });

    const settled = await Promise.allSettled(syncTasks);
    const providerResults: ProviderSyncResult[] = settled.map((s, i) =>
      s.status === "fulfilled"
        ? s.value
        : {
            providerName: providers[i].name,
            success: false,
            error: s.reason instanceof Error ? s.reason.message : String(s.reason),
            apiModels: 0,
            aiEnriched: 0,
            overrides: 0,
            newModels: [],
            newChannels: [],
            disabledChannels: [],
            modelCount: 0,
          },
    );

    for (let i = 0; i < providerResults.length; i++) {
      const result = providerResults[i];
      const provider = providers[i];
      const hasDocUrls =
        Array.isArray(provider.config?.docUrls) &&
        (provider.config.docUrls as unknown[]).length > 0;
      const aiNote =
        result.aiEnriched > 0
          ? `, AI: +${result.aiEnriched} enriched`
          : hasDocUrls
            ? ", AI: 0 enriched"
            : "";
      const overrideNote = result.overrides > 0 ? `, overrides: ${result.overrides}` : "";

      console.log(
        `[model-sync] ${provider.name}: ${result.success ? "OK" : "FAIL"} ` +
          `${result.modelCount} models (API: ${result.apiModels}${aiNote}${overrideNote}) ` +
          `+${result.newChannels.length} new, -${result.disabledChannels.length} disabled` +
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

    // 同步完成后自动分类未挂载模型到别名
    try {
      const { classifyNewModels, inferMissingBrands, inferMissingCapabilities } =
        await import("./alias-classifier");
      const classifyResult = await classifyNewModels();
      if (
        classifyResult.classified > 0 ||
        classifyResult.newAliases > 0 ||
        classifyResult.skipped > 0
      ) {
        console.log(
          `[model-sync] Alias classification: classified=${classifyResult.classified}, newAliases=${classifyResult.newAliases}, skipped=${classifyResult.skipped}`,
        );
      }
      // 补推 brand 为空的别名
      const brandResult = await inferMissingBrands();
      if (brandResult.updated > 0 || brandResult.skipped > 0) {
        console.log(
          `[model-sync] Brand inference: updated=${brandResult.updated}, skipped=${brandResult.skipped}`,
        );
      }
      // 补推 capabilities 为空的别名
      const capsResult = await inferMissingCapabilities();
      if (capsResult.updated > 0 || capsResult.skipped > 0) {
        console.log(
          `[model-sync] Capabilities inference: updated=${capsResult.updated}, skipped=${capsResult.skipped}`,
        );
      }
    } catch (err) {
      console.log(
        `[model-sync] Alias classification failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 同步完成后 invalidate 所有相关缓存
    const { getRedis } = await import("@/lib/redis");
    const redis = getRedis();
    if (redis) {
      await redis
        .del(
          "models:list",
          "models:list:TEXT",
          "models:list:IMAGE",
          "models:list:VIDEO",
          "models:list:AUDIO",
          "cache:admin:channels",
        )
        .catch(() => {});
    }

    return syncResult;
  } finally {
    syncInProgress = false;
  }
}

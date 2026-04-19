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
 * 4. 全都没有 → costPrice = 0
 *
 * 注意：sellPrice 不再由 sync 管理，统一在 ModelAlias.sellPrice 设置
 */

import { prisma } from "@/lib/prisma";
// model-capabilities-fallback removed — capabilities now managed via Admin UI
import type {
  SyncAdapter,
  SyncedModel,
  ProviderWithConfig,
  PricingOverride,
} from "./adapters/base";

import { enrichFromDocs } from "./doc-enricher";
import { getRedis } from "@/lib/redis";
import { acquireLeaderLock, releaseLeaderLock } from "@/lib/infra/leader-lock";
import type { ModelModality, Prisma } from "@prisma/client";

// ── 适配器注册表 ──
import { openaiAdapter } from "./adapters/openai";
import { anthropicAdapter } from "./adapters/anthropic";
import { deepseekAdapter } from "./adapters/deepseek";
import { zhipuAdapter } from "./adapters/zhipu";
import { volcengineAdapter } from "./adapters/volcengine";
import { siliconflowAdapter } from "./adapters/siliconflow";
import { openrouterAdapter } from "./adapters/openrouter";
import { minimaxAdapter } from "./adapters/minimax";
import { moonshotAdapter } from "./adapters/moonshot";
import { qwenAdapter } from "./adapters/qwen";
import { stepfunAdapter } from "./adapters/stepfun";
// model-whitelist.ts removed — whitelist now managed via Model.enabled in DB

// F-IG-02: concurrency guard is now a distributed lock (Redis NX EX) instead
// of a per-process boolean. Prior `syncInProgress` let every replica start
// its own sync in parallel because each had its own process-local flag.
const SYNC_LOCK_KEY = "model-sync";
const SYNC_LOCK_TTL_SEC = 3600; // a full sync should never exceed ~1h

const ADAPTERS: Record<string, SyncAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  deepseek: deepseekAdapter,
  zhipu: zhipuAdapter,
  volcengine: volcengineAdapter,
  siliconflow: siliconflowAdapter,
  openrouter: openrouterAdapter,
  minimax: minimaxAdapter,
  moonshot: moonshotAdapter,
  qwen: qwenAdapter,
  stepfun: stepfunAdapter,
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
    totalWarningProviders: number;
  };
}

interface ProviderSyncResult {
  providerName: string;
  success: boolean;
  warning?: string;
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
  return modelId.toLowerCase();
}

// ============================================================
// 数据库 reconcile
// ============================================================

async function reconcile(
  provider: ProviderWithConfig,
  models: SyncedModel[],
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

  // BL-INFRA-RESILIENCE F-IR-03 / H-4: batch reconcile.
  // Previous implementation issued ~4 queries per model (findUnique + upsert
  // Model, findUnique + upsert Channel) = 50+ round-trips for a mid-size
  // provider. Batched flow below issues 2 findManys + 1 createMany Model +
  // 1 createMany Channel + a handful of updates (only when diff detected),
  // reducing a 10-model sync to <10 round-trips in the common case and 3-4
  // when all models are brand-new.

  // ── Resolve canonical names up front ──
  const canonicalNames = await Promise.all(
    dedupedModels.map((m) => resolveCanonicalName(m.modelId)),
  );
  const remoteWithCanonical = dedupedModels.map((m, i) => ({
    remote: m,
    canonical: canonicalNames[i],
  }));

  const [existingChannels, existingModels] = await Promise.all([
    prisma.channel.findMany({ where: { providerId: provider.id }, include: { model: true } }),
    prisma.model.findMany({ where: { name: { in: canonicalNames } } }),
  ]);

  const existingModelByName = new Map(existingModels.map((m) => [m.name, m]));
  const existingChannelByRealId = new Map(existingChannels.map((c) => [c.realModelId, c]));
  const remoteRealModelIds = new Set(dedupedModels.map((m) => m.modelId));

  // ── Model: batch create missing + record new names ──
  const modelsToCreate = remoteWithCanonical
    .filter(({ canonical }) => !existingModelByName.has(canonical))
    .map(({ remote, canonical }) => ({
      name: canonical,
      displayName: remote.displayName ?? canonical,
      modality: remote.modality as ModelModality,
      contextWindow: remote.contextWindow ?? null,
      maxTokens: remote.maxOutputTokens ?? null,
      capabilities: {} as Prisma.InputJsonValue,
      enabled: false,
    }));
  if (modelsToCreate.length > 0) {
    await prisma.model.createMany({ data: modelsToCreate, skipDuplicates: true });
    // Record new-model names for the caller summary. A model is "new" when
    // this provider had no channel pointing at a Model of the same canonical
    // name before.
    const priorNames = new Set(existingChannels.map((ch) => ch.model.name));
    for (const m of modelsToCreate) {
      if (!priorNames.has(m.name)) newModels.push(m.name);
    }
  }

  // Model updates (contextWindow only — capabilities/displayName are admin-curated)
  const modelUpdates = remoteWithCanonical
    .filter(({ remote, canonical }) => {
      const existing = existingModelByName.get(canonical);
      return existing && remote.contextWindow && existing.contextWindow !== remote.contextWindow;
    })
    .map(({ remote, canonical }) =>
      prisma.model.update({
        where: { name: canonical },
        data: { contextWindow: remote.contextWindow ?? null },
      }),
    );
  if (modelUpdates.length > 0) {
    await Promise.all(modelUpdates);
  }

  // ── Refresh Model id map for channel creation ──
  // Only re-query if we just created new rows; otherwise reuse the map.
  if (modelsToCreate.length > 0) {
    const refreshed = await prisma.model.findMany({ where: { name: { in: canonicalNames } } });
    refreshed.forEach((m) => existingModelByName.set(m.name, m));
  }

  // ── Channel: split into create vs update ──
  const channelsToCreate: Prisma.ChannelCreateManyInput[] = [];
  const channelUpdates: Promise<unknown>[] = [];
  for (const { remote, canonical } of remoteWithCanonical) {
    const model = existingModelByName.get(canonical);
    if (!model) continue; // should not happen — createMany would have filled it
    const costPrice = buildCostPrice(remote);
    const existingChannel = existingChannelByRealId.get(remote.modelId);
    if (existingChannel) {
      const updateData: Prisma.ChannelUpdateInput = {
        realModelId: remote.modelId,
        costPrice: costPrice as unknown as Prisma.InputJsonValue,
      };
      if (existingChannel.status !== "ACTIVE") updateData.status = "ACTIVE";
      channelUpdates.push(
        prisma.channel.update({ where: { id: existingChannel.id }, data: updateData }),
      );
    } else {
      channelsToCreate.push({
        modelId: model.id,
        providerId: provider.id,
        realModelId: remote.modelId,
        status: "ACTIVE",
        priority: 10,
        costPrice: costPrice as unknown as Prisma.InputJsonValue,
      });
      newChannels.push(`${provider.name}/${remote.modelId} → ${canonical}`);
    }
  }
  if (channelsToCreate.length > 0) {
    await prisma.channel.createMany({ data: channelsToCreate, skipDuplicates: true });
  }
  if (channelUpdates.length > 0) {
    await Promise.all(channelUpdates);
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
      if (result.error) {
        // Layer 1 failed but existing data preserved — mark as warning, not success
        result.success = false;
        result.warning = `fetchModels failed, existing ${existingChannelCount} channels preserved`;
      } else {
        result.success = true;
      }
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
    const dbResult = await reconcile(provider, models);
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
  const gotLock = await acquireLeaderLock(SYNC_LOCK_KEY, SYNC_LOCK_TTL_SEC);
  if (!gotLock) {
    console.log("[model-sync] Sync already in progress (distributed lock held), skipping");
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
        totalWarningProviders: 0,
      },
    };
  }

  const startedAt = new Date();

  try {
    const providers = await prisma.provider.findMany({
      where: { status: "ACTIVE" },
      include: { config: true },
    });

    // Write initial sync progress to Redis
    const progressRedis = getRedis();
    const totalProviders = providers.length;
    if (progressRedis) {
      await progressRedis
        .set(
          "sync:progress",
          JSON.stringify({
            status: "running",
            total: totalProviders,
            completed: 0,
            providers: providers.map((p) => ({
              name: p.name,
              status: "pending",
            })),
          }),
          "EX",
          300,
        )
        .catch(() => {});
    }

    let completedCount = 0;

    // 并行同步所有 provider（各 provider 独立，互不阻塞）
    const syncTasks = providers.map((provider) => {
      const adapter = ADAPTERS[provider.name];
      if (!adapter) {
        const noAdapterResult: ProviderSyncResult = {
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
        };
        completedCount++;
        if (progressRedis) {
          progressRedis
            .set(
              "sync:progress",
              JSON.stringify({
                status: "running",
                total: totalProviders,
                completed: completedCount,
                providers: providers.map((p) => ({
                  name: p.name,
                  status:
                    p.name === provider.name ? "error" : completedCount > 0 ? "done" : "pending",
                })),
              }),
              "EX",
              300,
            )
            .catch(() => {});
        }
        return Promise.resolve(noAdapterResult);
      }
      return syncProvider(provider, adapter).then((res) => {
        completedCount++;
        if (progressRedis) {
          progressRedis
            .set(
              "sync:progress",
              JSON.stringify({
                status: "running",
                total: totalProviders,
                completed: completedCount,
                currentProvider: provider.name,
              }),
              "EX",
              300,
            )
            .catch(() => {});
        }
        return res;
      });
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

      const status = result.success ? "OK" : result.warning ? "WARNING" : "FAIL";
      console.log(
        `[model-sync] ${provider.name}: ${status} ` +
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
        totalWarningProviders: providerResults.filter((r) => !!r.warning).length,
      },
    };

    // Mark sync progress as done
    if (progressRedis) {
      await progressRedis
        .set(
          "sync:progress",
          JSON.stringify({ status: "done", total: totalProviders, completed: totalProviders }),
          "EX",
          60,
        )
        .catch(() => {});
    }

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

      // 持久化推断结果到 SystemConfig
      await setConfig(
        "LAST_INFERENCE_RESULT",
        JSON.stringify({
          timestamp: new Date().toISOString(),
          classify: classifyResult,
          brand: brandResult,
          capabilities: capsResult,
        }),
        "最近一次 LLM 推断结果（分类/品牌/能力）",
      );
    } catch (err) {
      console.log(
        `[model-sync] Alias classification failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 同步完成后 invalidate 所有相关缓存
    const cacheRedis = getRedis();
    if (cacheRedis) {
      await cacheRedis
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
    await releaseLeaderLock(SYNC_LOCK_KEY).catch(() => {});
  }
}

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
import { writeSystemLog } from "@/lib/system-logger";
import { isCatalogAuthoritative } from "./catalog-authority";
import {
  sendSyncReconcileSkippedToAdmins,
  sendSyncImageChannelSkippedToAdmins,
  type ReconcileSkipReason,
} from "@/lib/notifications/triggers";
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
import { xiaomiMimoAdapter } from "./adapters/xiaomi-mimo";
import { openaiCompatAdapter } from "./adapters/openai-compat";
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
  "xiaomi-mimo": xiaomiMimoAdapter,
};

/**
 * BL-DEEPSEEK-V4-HOTFIX fix_round 3：按 provider 名取专属适配器。
 * 健康检查的恢复门槛（scheduler.vetoRecovery）用它拉取权威模型目录。
 * 只认专属适配器 —— 走通用回退的 provider 目录命名不可靠，不作为下架依据。
 */
export function getSyncAdapter(providerName: string): SyncAdapter | undefined {
  return ADAPTERS[providerName];
}

// ── adapterType 回退表 ──
// provider.name 未命中 ADAPTERS 时，按 provider.adapterType 回退。
// 让后台 UI 新增的任意 OpenAI 兼容 provider 无需改代码即可同步。
// 仅映射 "openai-compat"（通用适配器用动态前缀 provider.name）；
// siliconflow/volcengine 等特殊 adapterType 的 named 适配器前缀写死，不适合异名复用，
// 故不入本表，未命中者仍走"无适配器"失败分支。
const ADAPTERS_BY_TYPE: Record<string, SyncAdapter> = {
  "openai-compat": openaiCompatAdapter,
};

/**
 * provider 是否走通用 fallback 适配器（无专属 named 适配器，且 adapterType 命中
 * ADAPTERS_BY_TYPE）。与派发逻辑 `ADAPTERS[name] ?? ADAPTERS_BY_TYPE[adapterType]`
 * 保持同一判定，供 reconcile 命名空间决策与运维脚本复用。
 */
export function providerUsesGenericFallbackAdapter(provider: {
  name: string;
  adapterType: string;
}): boolean {
  return !ADAPTERS[provider.name] && !!ADAPTERS_BY_TYPE[provider.adapterType];
}

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
    /** F-GTI-02: 本轮按 F-SI-01 跳过建 channel 的 IMAGE 模型总数（须人工补） */
    totalSkippedImageChannels: number;
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
  /**
   * BL-SYNC-INTEGRITY-PHASE1 F-SI-01: IMAGE channels intentionally not
   * created at sync time. F-BAX-08's CHECK 23514 forbids costPrice all-zero
   * on IMAGE channels, so the placeholder `{perCall:0,unit:'call'}` would
   * fail INSERT and roll back the whole provider's TEXT batch. Operators
   * must create IMAGE channels manually via Admin UI with a real costPrice;
   * this list surfaces the IMAGE models awaiting that manual step.
   */
  skippedImageChannels: string[];
  modelCount: number;
}

// ============================================================
// 定价辅助
// ============================================================
//
// BL-IMAGE-PRICING-OR-P2 fix_round 1（裁决文档：
// docs/adjudications/2026-04-25-or-p2-buildcostprice-regression.md）：
// IMAGE modality 返回 null —— 运营手设的 IMAGE channel 定价由 admin UI /
// 价格脚本管理，sync 不应覆盖。调用处看到 null 时跳过 costPrice 字段，
// 保留 channel 现有值；createMany（新建 IMAGE channel）走 buildInitialCostPrice
// 仍写默认 `{perCall:0,unit:"call"}`，靠 F-BIPOR-02 trigger 在后续运营 UPDATE
// 时拦截全 0。
function buildCostPrice(model: SyncedModel): {
  inputPer1M: number;
  outputPer1M: number;
  unit: "token";
} | null {
  if (model.modality === "IMAGE") return null;
  return {
    inputPer1M: model.inputPricePerM ?? 0,
    outputPer1M: model.outputPricePerM ?? 0,
    unit: "token",
  };
}

/** 新建 channel 的初始 costPrice：IMAGE 用 perCall:0 占位，TEXT 用 token 公式。 */
function buildInitialCostPrice(model: SyncedModel) {
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
 * 将 Provider 返回的 modelId 映射到 canonical name（models.name）。
 *
 * - 内置 named provider：直接返回裸 modelId（M1a 后 ModelAlias 不再持有 modelName）。
 *   同一模型可被多个 named provider 以多 channel 共享同一 canonical Model，用于故障转移。
 * - 通用 fallback provider（第三方 openai-compat 端点，如 guangtech）：以 provider.name
 *   作命名空间前缀 `${provider.name}/${modelId}`，避免其裸 modelId（如 reseller 的 gpt-5.5）
 *   与其它 provider 的同名模型撞名 / 被误合并到同一 canonical Model。
 *
 * 注意：channel.realModelId 始终保留裸 modelId（发往上游 API 用），仅 models.name 加前缀。
 */
function resolveCanonicalName(modelId: string, provider: ProviderWithConfig): string {
  const name = providerUsesGenericFallbackAdapter(provider)
    ? `${provider.name}/${modelId}`
    : modelId;
  return name.toLowerCase();
}

// ============================================================
// 数据库 reconcile
// ============================================================

async function reconcile(
  provider: ProviderWithConfig,
  models: SyncedModel[],
): Promise<{
  newModels: string[];
  newChannels: string[];
  disabledChannels: string[];
  skippedImageChannels: string[];
}> {
  const newModels: string[] = [];
  const newChannels: string[] = [];
  const disabledChannels: string[] = [];
  // F-SI-01: IMAGE remote models still create rows in `models` (no CHECK
  // constraint there) but skip `channels` to avoid CHECK 23514 rolling back
  // the whole provider's batch. Operators handle IMAGE channels manually.
  const skippedImageChannels: string[] = [];

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
  const canonicalNames = dedupedModels.map((m) => resolveCanonicalName(m.modelId, provider));
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
    const costPriceForUpdate = buildCostPrice(remote); // IMAGE → null（保留运营手设值）
    const existingChannel = existingChannelByRealId.get(remote.modelId);
    if (existingChannel) {
      const updateData: Prisma.ChannelUpdateInput = {
        realModelId: remote.modelId,
      };
      // F-BIPOR-04 R1: IMAGE modality buildCostPrice 返回 null → 此次 sync
      // 不动 channel.costPrice（避免覆盖 P1 F-BAX-08 / OR-P2 apply 的运营值）
      if (costPriceForUpdate !== null) {
        updateData.costPrice = costPriceForUpdate as unknown as Prisma.InputJsonValue;
      }
      if (existingChannel.status !== "ACTIVE") updateData.status = "ACTIVE";
      channelUpdates.push(
        prisma.channel.update({ where: { id: existingChannel.id }, data: updateData }),
      );
    } else {
      // F-SI-01: skip IMAGE channel creation. CHECK 23514 (F-BAX-08) rejects
      // any IMAGE channel with all-zero costPrice; the legacy placeholder
      // `{perCall:0,unit:'call'}` would have failed INSERT and aborted the
      // whole provider's createMany batch (silently dropping new TEXT
      // channels). Operators must create IMAGE channels manually via Admin
      // UI with real costPrice. The skipped models still exist in `models`.
      if (remote.modality === "IMAGE") {
        skippedImageChannels.push(`${provider.name}/${remote.modelId} → ${canonical}`);
        continue;
      }
      channelsToCreate.push({
        modelId: model.id,
        providerId: provider.id,
        realModelId: remote.modelId,
        status: "ACTIVE",
        priority: 10,
        costPrice: buildInitialCostPrice(remote) as unknown as Prisma.InputJsonValue,
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
  //
  // BL-MCP-PAGE-REVAMP fix-round-4 真因修复（更深层）：跨批次 regression
  // model-sync 跑 SiliconFlow / OpenAI 时只拉 chat completions 模型清单
  // (/v1/models)，**不包含 EMBEDDING modality**（如 BAAI/bge-m3）。
  // 原 toDisable filter 把 embedding channel 当作"消失模型"反复 DISABLED，
  // 即使 health probe PASS 也会被下次 sync 强制 disable。导致 fix-round-4
  // SQL 解锁 ACTIVE 后下次 sync 又被下架，try-it embed_text 持续 503。
  // 修复：toDisable 显式排除 EMBEDDING modality（这些 model 不通过 chat
  // completions list 同步，由 seed-embedding-models.ts 单独管理）。
  // 长期方向：modality-aware sync（按需拉 embeddings list 同步），但 MVP
  // 只需 EMBEDDING 不被误下架即可。
  //
  // BL-IMG-I2I-VISION F-IIV-09：EMBEDDING 豁免收进 `isCatalogAuthoritative`，
  // 与健康检查的 `vetoRecovery` 共用同一判据。此前两边各管各的，结果
  // `seedream-4-5`（realModelId 是火山接入点 ID `ep-…`，按设计永不出现在
  // /models）被这里每轮下架、又被 reachability 恢复，来回对打 59 次。
  const toDisable = existingChannels.filter(
    (ch) =>
      ch.status !== "DISABLED" &&
      !remoteRealModelIds.has(ch.realModelId) &&
      isCatalogAuthoritative({
        modality: ch.model.modality,
        quirks: provider.config?.quirks ?? null,
      }),
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

  return { newModels, newChannels, disabledChannels, skippedImageChannels };
}

// ============================================================
// BL-DEEPSEEK-V4-HOTFIX F-DSV4-03: 护栏命中的可见化
// ============================================================

/**
 * reconcile 被防误杀护栏拦下时，把这件事变成"看得见的"。
 *
 * ## 为什么需要
 *
 * 护栏本身是对的（上游 /models 抖动时不该批量下架通道），但原实现只
 * `console.log`。DeepSeek 直连下线 `deepseek-chat` / `deepseek-reasoner` 后
 * 远端模型数 5 → 2 触发 `shrink_guard`，2026-07-21 起连续 5 天每天 04:00 打印
 * 同一行日志，无 SystemLog、无通知 —— 陈旧通道就这么带病留在 priority=1 上，
 * 直到用户报障才被发现。
 *
 * **护栏命中 = 自动化主动放弃处置 = 必须有人来看一眼。** 因此这里同时写
 * SystemLog（可在 admin/logs 检索、留存 90 天）和管理员通知（24h dedup）。
 *
 * 本函数吞掉自身的所有异常：告警失败不能让整轮 sync 挂掉。
 */
export async function announceReconcileSkipped(params: {
  providerName: string;
  reason: ReconcileSkipReason;
  remoteModelCount: number;
  existingChannelCount: number;
}): Promise<void> {
  const detail = {
    provider: params.providerName,
    reason: params.reason,
    remoteModelCount: params.remoteModelCount,
    existingChannelCount: params.existingChannelCount,
  };
  const message =
    params.reason === "zero_models"
      ? `model-sync 跳过 ${params.providerName} 的 reconcile：上游返回 0 个模型，但库中仍有 ${params.existingChannelCount} 条在服役通道`
      : `model-sync 跳过 ${params.providerName} 的 reconcile：上游模型数 ${params.remoteModelCount} 不足现存通道数 ${params.existingChannelCount} 的 50%（缩水护栏）。若上游确已下线模型，需人工确认并下架陈旧通道`;

  await writeSystemLog("SYNC", "WARN", message, detail).catch((err) => {
    console.error("[model-sync] announceReconcileSkipped systemLog failed:", err);
  });
  await sendSyncReconcileSkippedToAdmins(params).catch((err) => {
    console.error("[model-sync] announceReconcileSkipped notification failed:", err);
  });
}

// ============================================================
// BL-IMG-GUANGTECH-CHANNEL F-GTI-02: 跳过 IMAGE channel 的可见化
// ============================================================

/**
 * sync 按 F-SI-01 跳过 IMAGE channel 创建时，把这件事变成"看得见的"。
 *
 * ## 为什么需要
 *
 * F-SI-01 的跳过本身是对的（`trg_validate_image_channel_pricing` 禁止 costPrice
 * 全零的 IMAGE channel，sync 又拿不到真实图片单价，硬建会让整批 createMany 连坐
 * 失败、把同批 TEXT channel 一起拖下水），但原实现**只把计数拼进 console.log**
 * —— 全仓 grep `skippedImageChannels` 只命中 model-sync.ts 自身。
 *
 * 后果：2026-07-03 的 sync 为 guangtech 建了 `gpt-image-1` / `-1.5` / `-2` 三行
 * models 却没建 channel，没有任何 UI / 通知 / SystemLog 提到过这件事，三个模型
 * 静默不可用一个月，直到用户报障「guangtech 无法生图」。
 *
 * 与 {@link announceReconcileSkipped} 是同一病根的第二次复发：
 * **自动化主动放弃处置 = 必须有人来看一眼。**
 *
 * 去重按「跳过集合」而非按 provider —— 跳过是持续状态（模型一直在、channel 一直
 * 没人补），按 provider 去重会在 24h 后原样重播成噪音；按集合去重则在同一批模型
 * 持续被跳过时保持安静，一旦出现**新的** IMAGE 模型立刻重新告警。
 *
 * 本函数吞掉自身的所有异常：告警失败不能让整轮 sync 挂掉。
 */
export async function announceSkippedImageChannels(entries: string[]): Promise<void> {
  if (entries.length === 0) return;

  const message =
    `model-sync 跳过了 ${entries.length} 个 IMAGE 模型的 channel 创建：模型已入库但没有通道，` +
    `在 Admin 手工补 channel + 真实 costPrice（{unit:'call', perCall>0}）之前一律无法调用`;

  await writeSystemLog("SYNC", "WARN", message, { count: entries.length, entries }).catch((err) => {
    console.error("[model-sync] announceSkippedImageChannels systemLog failed:", err);
  });
  await sendSyncImageChannelSkippedToAdmins({ entries }).catch((err) => {
    console.error("[model-sync] announceSkippedImageChannels notification failed:", err);
  });
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
    skippedImageChannels: [],
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
      await announceReconcileSkipped({
        providerName: provider.name,
        reason: "zero_models",
        remoteModelCount: 0,
        existingChannelCount,
      });
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
      await announceReconcileSkipped({
        providerName: provider.name,
        reason: "shrink_guard",
        remoteModelCount: models.length,
        existingChannelCount,
      });
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
    result.skippedImageChannels = dbResult.skippedImageChannels;

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
        totalSkippedImageChannels: 0,
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
      // name 优先命中内置 named 适配器（保证现有 provider 行为不变），
      // 未命中时按 adapterType 回退到通用适配器（如 openai-compat）。
      const adapter = ADAPTERS[provider.name] ?? ADAPTERS_BY_TYPE[provider.adapterType];
      if (!adapter) {
        const noAdapterResult: ProviderSyncResult = {
          providerName: provider.name,
          success: false,
          error: `No sync adapter found for provider "${provider.name}" (adapterType="${provider.adapterType}")`,
          apiModels: 0,
          aiEnriched: 0,
          overrides: 0,
          newModels: [],
          newChannels: [],
          disabledChannels: [],
          skippedImageChannels: [],
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
            skippedImageChannels: [],
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
      const skipNote =
        result.skippedImageChannels.length > 0
          ? `, skipped IMAGE: ${result.skippedImageChannels.length}`
          : "";
      console.log(
        `[model-sync] ${provider.name}: ${status} ` +
          `${result.modelCount} models (API: ${result.apiModels}${aiNote}${overrideNote}) ` +
          `+${result.newChannels.length} new, -${result.disabledChannels.length} disabled${skipNote}` +
          (result.error ? ` error: ${result.error}` : ""),
      );
    }

    const finishedAt = new Date();
    // F-GTI-02: 跨 provider 汇总本轮被跳过的 IMAGE 模型，供 summary + 告警共用。
    const allSkippedImageChannels = providerResults.flatMap((r) => r.skippedImageChannels);
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
        totalSkippedImageChannels: allSkippedImageChannels.length,
      },
    };

    // F-GTI-02: 跳过 IMAGE channel 是"自动化主动放弃处置"，必须有人来看一眼。
    // 放在 syncResult 组装之后、缓存清理之前；本身吞异常，不阻断整轮 sync。
    await announceSkippedImageChannels(allSkippedImageChannels);

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

// Exported for F-BIPOR-04 + F-SI-01 + F-SI-02 unit tests
export const __testing = { buildCostPrice, buildInitialCostPrice, reconcile, ADAPTERS };

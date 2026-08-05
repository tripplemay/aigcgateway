/**
 * 通道路由器
 *
 * alias → ModelAlias → AliasModelLink[] → Model[] → Channel(ACTIVE, priority ASC) → Provider + Config → Adapter
 */

import { prisma } from "@/lib/prisma";
import type { EngineAdapter, RouteResult, RouteResultWithCandidates } from "./types";
import { EngineError, ErrorCodes } from "./types";
import { OpenAICompatEngine } from "./openai-compat";
import { VolcengineAdapter } from "./adapters/volcengine";
import { SiliconFlowAdapter } from "./adapters/siliconflow";
import { getCooldownChannelIds, isTransientFailureReason } from "./cooldown";

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
export async function routeByAlias(aliasName: string): Promise<RouteResultWithCandidates> {
  // F-RR2-06: include DEGRADED channels in the candidate pool. DEGRADED is
  // the scheduler's "transient failure" state — a channel that just hit 429
  // / 限流 but might recover within the next cooldown window. Keeping it here
  // lets withFailover actually try it (and write the 300 s Redis cooldown)
  // instead of silently skipping it. DISABLED remains filtered out because
  // it means "permanently failed per 3-batch escalation".
  const alias = await prisma.modelAlias.findUnique({
    where: { alias: aliasName, enabled: true },
    include: {
      models: {
        include: {
          model: {
            include: {
              channels: {
                where: { status: { in: ["ACTIVE", "DEGRADED"] } },
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
  //
  // F-RR2-05: a FAIL health check is treated differently depending on whether
  // the failure was transient (429 / 限流 / timeout) or permanent (auth,
  // persistent 5xx). Transient FAILs stay in the candidate list so failover
  // can try them again once the cooldown window passes — the Redis cooldown
  // below handles the short-term de-prioritization. Permanent FAILs are
  // filtered out to avoid burning request budget on a known-bad channel.
  const candidateChannels = alias.models
    .filter((link) => link.model.enabled === true)
    .flatMap((link) =>
      link.model.channels.map((ch) => {
        const lastCheck = ch.healthChecks[0];
        const healthFail = !!lastCheck && lastCheck.result === "FAIL";
        const transientFail = healthFail && isTransientFailureReason(lastCheck.errorMessage);
        return {
          channel: ch,
          provider: ch.provider,
          config: ch.provider.config,
          model: link.model,
          healthFail,
          transientFail,
          degraded: ch.status === "DEGRADED",
        };
      }),
    )
    .filter((c) => c.config != null && (!c.healthFail || c.transientFail))
    .sort((a, b) => a.channel.priority - b.channel.priority);

  if (candidateChannels.length === 0) {
    throw new EngineError(
      `No active channel available for "${aliasName}"`,
      ErrorCodes.CHANNEL_UNAVAILABLE,
      503,
    );
  }

  // F-RR2-02: de-prioritize (but don't remove) channels that are currently
  // cooling down from a recent failure. Keeping them in the list preserves
  // the contract that "every candidate gets a shot" when healthier peers
  // are exhausted.
  const cooldownIds = await getCooldownChannelIds(candidateChannels.map((c) => c.channel.id));

  // Sort priority ASC → non-cooldown first → transient-FAIL/DEGRADED last →
  // health PASS first → NULL last. DEGRADED channels (recent transient
  // failure detected by the scheduler) sink to the same "demoted" band as
  // cooldown / transient-FAIL peers — still reachable so withFailover can
  // attempt them, but healthy ACTIVE peers go first.
  candidateChannels.sort((a, b) => {
    if (a.channel.priority !== b.channel.priority) return a.channel.priority - b.channel.priority;
    const aCool = cooldownIds.has(a.channel.id) || a.transientFail || a.degraded;
    const bCool = cooldownIds.has(b.channel.id) || b.transientFail || b.degraded;
    if (aCool !== bCool) return aCool ? 1 : -1;
    const aPass = a.channel.healthChecks.length > 0 && a.channel.healthChecks[0].result === "PASS";
    const bPass = b.channel.healthChecks.length > 0 && b.channel.healthChecks[0].result === "PASS";
    if (aPass && !bPass) return -1;
    if (!aPass && bPass) return 1;
    return 0;
  });

  const candidates = candidateChannels.map((c) => ({
    channel: c.channel,
    provider: c.provider,
    config: c.config!,
    model: c.model,
    alias,
  }));

  return { best: candidates[0], candidates };
}

/**
 * 根据底层模型名路由。
 *
 * ⚠️ 内部专用，**不得**用于面向用户的请求路径。
 *
 * BL-SEC-HOTFIX-2608 F-SH-03（审查 C6）：本函数返回的 RouteResult 不含 `alias`，
 * 而 alias 是网关的唯一卖价来源（model-sync.ts:13「sellPrice 不再由 sync 管理，
 * 统一在 ModelAlias.sellPrice 设置」，故 sync 建的 channel.sellPrice 为 null）。
 * 一旦这条路径承接真实流量，calculateTokenCost 两个卖价来源皆空 → sellUsd=0 →
 * shouldDeduct=false → 调用成功、上游成本照付、但完全不扣费不写 Transaction。
 * 同时 alias 缺失还会让 alias.enabled=false 的停用开关失效、
 * chat/completions 与 image-generation-core 的 modality 门禁被整体跳过。
 *
 * 因此它已从 resolveEngine 的回退路径中移除，也不再从 @/lib/engine 对外导出。
 * 新增调用方前请确认该调用不参与计费。
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
 * 一步到位：路由 + 获取 Adapter。**别名是唯一入口。**
 *
 * BL-SEC-HOTFIX-2608 F-SH-03（审查 C6）：此处原本有一条回退——别名解析抛
 * MODEL_NOT_FOUND 时改按底层 Model.name 路由，注释写的是「避免测试/脚本直接传
 * 模型名时触发 404」。但 resolveEngine 的全部调用方都是用户可控入口
 * （/v1/chat/completions、/v1/embeddings、MCP chat、MCP embed_text、action runner），
 * 于是这条为便利而生的兜底变成了一条面向公网的旁路：
 *
 *   1. 零计费——回退返回的 route 不含 alias，而 alias 是唯一卖价来源，
 *      sellUsd 恒为 0，调用成功、上游成本照付、不扣费不写 Transaction
 *   2. 停用开关失效——routeByAlias 要求 alias.enabled=true，别名停用后抛的正是
 *      MODEL_NOT_FOUND，恰好落进回退，管理员「停用别名」等于没停
 *   3. modality 门禁被跳过——两处门禁读的都是 route.alias?.modality
 *
 * 且触发条件是常态而非边缘：alias-classifier 的职责就是把带日期/前缀的模型 ID
 * 归一化成别名（gpt-4o-2024-08-06 → gpt-4o），而 resolveCanonicalName 保存的
 * Model.name 是未归一化的裸 modelId——每个带后缀的模型，其原始名天然满足
 * 「是 Model.name 但不是别名」。
 *
 * 因此别名不存在或已停用一律 404，不再回退。
 */
export async function resolveEngine(aliasName: string): Promise<{
  route: RouteResult;
  adapter: EngineAdapter;
  candidates: RouteResult[];
}> {
  const { best, candidates } = await routeByAlias(aliasName);
  const adapter = getAdapterForRoute(best);
  return { route: best, adapter, candidates };
}

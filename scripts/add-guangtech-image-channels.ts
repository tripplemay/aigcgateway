/**
 * BL-IMG-GUANGTECH-CHANNEL F-GTI-01 — 幂等打通 guangtech 的三个图片模型。
 *
 * 在 guangtech provider 下为 `gpt-image-1` / `gpt-image-1.5` / `gpt-image-2` 各自
 * upsert：Model（已存在，仅置 enabled=true）+ Channel（新建）+ ModelAlias（新建）
 * + AliasModelLink。复用 scripts/add-seedream-45.ts 的幂等 upsert 范式
 * （provider 必须已存在，不创建；不动 ProviderConfig）。
 *
 * 背景（见 docs/specs/BL-IMG-GUANGTECH-CHANNEL-spec.md §1）：
 *   2026-07-03 的 sync 为 guangtech 建了三行 IMAGE models，但按 model-sync.ts:372-380
 *   的 F-SI-01 设计**跳过了 IMAGE channel 创建**（DB 触发器 trg_validate_image_channel_pricing
 *   禁止 costPrice 全零的 IMAGE channel，而 sync 拿不到真实图片单价），留待人工在
 *   Admin 补 channel + 真实定价。跳过记录只走 console.log，无人知晓 → 静默躺了一个月。
 *   本脚本即"人工补 channel"这一步的可重复、可 dry-run、可回滚版本。
 *
 * 用法：
 *   # 1) dry-run（默认，不写库，只读现状 + 打印将执行的动作）
 *   npx tsx scripts/add-guangtech-image-channels.ts
 *
 *   # 2) 上游可用性实测（L2：真实生图、产生上游费用，须先取得用户明示授权）
 *   npx tsx scripts/add-guangtech-image-channels.ts --probe
 *
 *   # 3) 真正写库（建议先跑 --probe 确认上游可用）
 *   npx tsx scripts/add-guangtech-image-channels.ts --apply
 *   APPLY=1 npx tsx scripts/add-guangtech-image-channels.ts
 *
 *   # 只处理部分模型（探测失败的模型不应 apply）
 *   npx tsx scripts/add-guangtech-image-channels.ts --apply --only=gpt-image-2
 *
 *   生产执行须先开隧道，见 docs/specs/BL-IMG-GUANGTECH-CHANNEL-ops.md。
 *
 * 定价依据（spec D3，用户裁决「参照 openrouter」）：
 *   - sellPrice.perCall = $0.082603/张 —— 取 openrouter 线上 `gpt-image` 别名的
 *     用户实付价，用户侧不涨不跌。
 *   - costPrice.perCall = $0.068836/张 —— 由上者 ÷ 全项目统一的 1.2x markup 反推
 *     （scripts/pricing/fix-image-channels-2026-04-24.ts:8 明文口径；qwen /
 *     siliconflow / volcengine / openrouter 全部严格 1.2x），按 prisma.ts roundTo6
 *     取 6 位小数。
 *   - guangtech ProviderConfig.currency=USD ⇒ calculateCallCost 的 exchangeRate=1，
 *     perCall 即 USD，无需汇率换算。
 *
 *   ⚠️ costPrice 是"对齐 openrouter 口径"的**名义成本**，不是 guangtech 的真实进价
 *      （上游未提供计价 API）。它只影响毛利报表与对账，**不影响用户扣费金额**。
 *      拿到真实费率后改 channel.costPrice 一处即可，无需改代码。
 *   ⚠️ gpt-image-1 / -1.5 无 openrouter 对照价，沿用与 -2 相同的 perCall，同样是假设。
 *      sellPrice 与用户今天付的 gpt-image 一致（收入中性），可随时在 admin 调整。
 *
 * 单位（spec D2）：IMAGE channel 的定价必须是 `{unit:'call', perCall>0}` ——
 *   src/lib/api/admin-schemas.ts:80 的 imageChannelPriceValid 强制该 shape，
 *   token 计价过不了 admin 校验；且 guangtech imageViaChat=false + imageEndpoint=
 *   /images/generations ⇒ 走 openai-compat.imageGenerations() 标准路径，响应无
 *   token usage，per-call 是唯一算得出钱的口径（post-process.ts calculateCallCost）。
 *
 * supportedSizes（spec D4）：置 null，跳过 image-generation-core 的 size 预校验避免
 *   误拒（与现有 gpt-image 的 model openai/gpt-5-image 一致，其 supportedSizes 亦为
 *   null）。alias.capabilities.supported_sizes 只声明实测通过的尺寸。
 */

import { PrismaClient, type ModelModality } from "@prisma/client";

const PROVIDER_NAME = "guangtech";
const BRAND = "OpenAI";

/** 每张成本（USD）。见文件头「定价依据」——名义值，非 guangtech 真实进价。 */
const COST_PER_CALL_USD = 0.068836;
/** 每张售价（USD）。= openrouter `gpt-image` 别名现行实付价。 */
const SELL_PER_CALL_USD = 0.082603;

/** 探测用尺寸；也是 alias.capabilities.supported_sizes 的唯一声明值。 */
const PROBE_SIZE = "1024x1024";
const PROBE_PROMPT = "A single red apple on a plain white background, product photo";

interface TargetSpec {
  /** 生产 models.name（canonical，带 provider 前缀，见 fix-guangtech-canonical-naming.ts） */
  modelName: string;
  /** 上游真实模型 ID（裸名，即 guangtech /v1/models 返回的 id） */
  realModelId: string;
  /** 新建的对外别名 */
  alias: string;
  displayName: string;
  description: string;
}

const TARGETS: TargetSpec[] = [
  {
    modelName: "guangtech/gpt-image-1",
    realModelId: "gpt-image-1",
    alias: "gpt-image-1",
    displayName: "GPT Image 1",
    description: "OpenAI GPT Image 1 text-to-image model, served via the guangtech gateway.",
  },
  {
    modelName: "guangtech/gpt-image-1.5",
    realModelId: "gpt-image-1.5",
    alias: "gpt-image-1.5",
    displayName: "GPT Image 1.5",
    description: "OpenAI GPT Image 1.5 text-to-image model, served via the guangtech gateway.",
  },
  {
    modelName: "guangtech/gpt-image-2",
    realModelId: "gpt-image-2",
    alias: "gpt-image-2",
    displayName: "GPT Image 2",
    description: "OpenAI GPT Image 2 text-to-image model, served via the guangtech gateway.",
  },
];

/**
 * alias.capabilities —— 只声明**实测确认**的能力。
 * 未验证的一律 false / 不声明（spec F-GTI-01 acceptance）。
 * image_input / image_to_image 待后续 i2i 批次实测后再开。
 */
function buildCapabilities(verifiedSizes: string[]) {
  return {
    vision: false,
    json_mode: false,
    streaming: false,
    image_input: false,
    image_to_image: false,
    system_prompt: false,
    function_calling: false,
    supported_sizes: verifiedSizes,
  };
}

export interface TargetResult {
  alias: string;
  modelName: string;
  action: "created" | "updated" | "skipped";
  reason?: string;
  modelId?: string;
  channelId?: string;
  aliasId?: string;
}

export interface ProvisionResult {
  provider: string;
  results: TargetResult[];
}

// ----------------------------------------------------------------
// 上游可用性实测（L2）
// ----------------------------------------------------------------

export interface ProbeOutcome {
  realModelId: string;
  ok: boolean;
  /** 'b64_json' | 'url' | null */
  payload: "b64_json" | "url" | null;
  bytes?: number;
  latencyMs: number;
  httpStatus?: number;
  error?: string;
}

/**
 * 对单个上游模型打一次真实 /images/generations 请求。
 *
 * ⚠️ L2：会产生真实上游费用（约 $0.07/次）。按 .auto-memory/role-context/evaluator.md
 * 「L2 测试需用户明确授权再执行」，调用方须已取得用户授权。
 */
export async function probeUpstream(
  baseUrl: string,
  apiKey: string,
  realModelId: string,
  timeoutMs = 180_000,
): Promise<ProbeOutcome> {
  const url = `${baseUrl.replace(/\/$/, "")}/images/generations`;
  const startedAt = process.hrtime.bigint();
  const elapsed = () => Number(process.hrtime.bigint() - startedAt) / 1e6;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: realModelId,
        prompt: PROBE_PROMPT,
        n: 1,
        size: PROBE_SIZE,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        realModelId,
        ok: false,
        payload: null,
        latencyMs: elapsed(),
        httpStatus: response.status,
        error: `HTTP ${response.status}: ${body.slice(0, 300)}`,
      };
    }

    const json = (await response.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
      error?: { message?: string };
    };

    if (json.error) {
      return {
        realModelId,
        ok: false,
        payload: null,
        latencyMs: elapsed(),
        httpStatus: response.status,
        error: `body error: ${json.error.message ?? JSON.stringify(json.error).slice(0, 300)}`,
      };
    }

    const first = json.data?.[0];
    if (first?.b64_json) {
      return {
        realModelId,
        ok: true,
        payload: "b64_json",
        bytes: Buffer.from(first.b64_json, "base64").byteLength,
        latencyMs: elapsed(),
        httpStatus: response.status,
      };
    }
    if (first?.url) {
      return {
        realModelId,
        ok: true,
        payload: "url",
        latencyMs: elapsed(),
        httpStatus: response.status,
      };
    }

    return {
      realModelId,
      ok: false,
      payload: null,
      latencyMs: elapsed(),
      httpStatus: response.status,
      error: `no image in response: ${JSON.stringify(json).slice(0, 300)}`,
    };
  } catch (err) {
    return {
      realModelId,
      ok: false,
      payload: null,
      latencyMs: elapsed(),
      error: (err as Error).message,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ----------------------------------------------------------------
// 幂等 provisioning
// ----------------------------------------------------------------

/**
 * 幂等 upsert guangtech 的图片 Model + Channel + Alias + Link。
 * Provider 必须已存在（不创建）；缺失时全部 skipped。
 * dryRun=true 时不写库，仅读现状 + 打印意图。
 */
export async function provisionGuangtechImageChannels(
  prisma: PrismaClient,
  opts: { dryRun?: boolean; only?: string[]; logPrefix?: string } = {},
): Promise<ProvisionResult> {
  const dryRun = opts.dryRun ?? true;
  const prefix = opts.logPrefix ?? "  ";
  const targets = opts.only?.length
    ? TARGETS.filter((t) => opts.only!.includes(t.alias) || opts.only!.includes(t.realModelId))
    : TARGETS;

  const provider = await prisma.provider.findUnique({
    where: { name: PROVIDER_NAME },
    include: { config: { select: { imageViaChat: true, currency: true, imageEndpoint: true } } },
  });

  if (!provider) {
    console.log(`${prefix}[skip] Provider '${PROVIDER_NAME}' 不存在`);
    return {
      provider: PROVIDER_NAME,
      results: targets.map((t) => ({
        alias: t.alias,
        modelName: t.modelName,
        action: "skipped" as const,
        reason: "provider_missing",
      })),
    };
  }

  // provider 级配置只校验不修改（本批次不动 ProviderConfig）
  if (provider.config?.currency !== "USD") {
    console.log(
      `${prefix}[warn] ${PROVIDER_NAME} ProviderConfig.currency=${provider.config?.currency}` +
        ` (期望 USD；否则 perCall 会被当作本币按汇率换算，扣费金额会错)`,
    );
  }
  if (provider.config?.imageViaChat !== false) {
    console.log(
      `${prefix}[warn] ${PROVIDER_NAME} ProviderConfig.imageViaChat=${provider.config?.imageViaChat}` +
        ` (期望 false；gpt-image 系列走标准 /images/generations)`,
    );
  }

  const results: TargetResult[] = [];

  for (const t of targets) {
    const existingModel = await prisma.model.findUnique({
      where: { name: t.modelName },
      select: { id: true, enabled: true, modality: true },
    });
    const existingChannel = existingModel
      ? await prisma.channel.findUnique({
          where: {
            providerId_modelId: { providerId: provider.id, modelId: existingModel.id },
          },
          select: { id: true },
        })
      : null;
    const existingAlias = await prisma.modelAlias.findUnique({
      where: { alias: t.alias },
      select: { id: true },
    });

    if (dryRun) {
      console.log(
        `${prefix}[dry-run] ${t.alias}` +
          ` | model ${t.modelName} ${existingModel ? (existingModel.enabled ? "EXISTS(enabled)" : "EXISTS→enable") : "CREATE"}` +
          ` | channel ${existingChannel ? "EXISTS→update" : "CREATE"} realModelId=${t.realModelId}` +
          ` | alias ${existingAlias ? "EXISTS→update" : "CREATE"}` +
          ` | cost=$${COST_PER_CALL_USD}/张 sell=$${SELL_PER_CALL_USD}/张`,
      );
      results.push({
        alias: t.alias,
        modelName: t.modelName,
        action: existingChannel ? "updated" : "created",
        reason: "dry_run",
      });
      continue;
    }

    const model = await prisma.model.upsert({
      where: { name: t.modelName },
      update: {
        displayName: t.displayName,
        description: t.description,
        modality: "IMAGE" as ModelModality,
        enabled: true,
        supportedSizes: undefined, // D4：不加硬拒，交由上游校验
      },
      create: {
        name: t.modelName,
        displayName: t.displayName,
        description: t.description,
        modality: "IMAGE" as ModelModality,
        enabled: true,
      },
    });

    const channel = await prisma.channel.upsert({
      where: { providerId_modelId: { providerId: provider.id, modelId: model.id } },
      update: {
        realModelId: t.realModelId,
        costPrice: { unit: "call", perCall: COST_PER_CALL_USD },
        sellPrice: { unit: "call", perCall: SELL_PER_CALL_USD },
        status: "ACTIVE",
      },
      create: {
        providerId: provider.id,
        modelId: model.id,
        realModelId: t.realModelId,
        priority: 10,
        costPrice: { unit: "call", perCall: COST_PER_CALL_USD },
        sellPrice: { unit: "call", perCall: SELL_PER_CALL_USD },
        status: "ACTIVE",
      },
    });

    const alias = await prisma.modelAlias.upsert({
      where: { alias: t.alias },
      update: {
        brand: BRAND,
        modality: "IMAGE" as ModelModality,
        enabled: true,
        deprecated: false,
        sellPrice: { unit: "call", perCall: SELL_PER_CALL_USD },
        capabilities: buildCapabilities([PROBE_SIZE]),
        description: t.description,
      },
      create: {
        alias: t.alias,
        brand: BRAND,
        modality: "IMAGE" as ModelModality,
        enabled: true,
        deprecated: false,
        sellPrice: { unit: "call", perCall: SELL_PER_CALL_USD },
        capabilities: buildCapabilities([PROBE_SIZE]),
        description: t.description,
      },
    });

    await prisma.aliasModelLink.upsert({
      where: { aliasId_modelId: { aliasId: alias.id, modelId: model.id } },
      update: {},
      create: { aliasId: alias.id, modelId: model.id },
    });

    const action: TargetResult["action"] = existingChannel ? "updated" : "created";
    console.log(`${prefix}[${action}] ${t.alias} → ${PROVIDER_NAME}/${t.realModelId}`);
    results.push({
      alias: t.alias,
      modelName: t.modelName,
      action,
      modelId: model.id,
      channelId: channel.id,
      aliasId: alias.id,
    });
  }

  return { provider: PROVIDER_NAME, results };
}

// ----------------------------------------------------------------
// Standalone CLI 入口
// ----------------------------------------------------------------

function parseOnly(): string[] | undefined {
  const arg = process.argv.find((a) => a.startsWith("--only="));
  if (!arg) return undefined;
  return arg
    .slice("--only=".length)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function runProbe(prisma: PrismaClient, only?: string[]): Promise<void> {
  const provider = await prisma.provider.findUnique({
    where: { name: PROVIDER_NAME },
    select: { baseUrl: true, authConfig: true },
  });
  if (!provider) {
    console.log(`[probe] Provider '${PROVIDER_NAME}' 不存在，无法探测`);
    return;
  }
  const apiKey = (provider.authConfig as { apiKey?: string } | null)?.apiKey;
  if (!apiKey) {
    console.log(`[probe] Provider '${PROVIDER_NAME}' 未配置 authConfig.apiKey，无法探测`);
    return;
  }

  const targets = only?.length
    ? TARGETS.filter((t) => only.includes(t.alias) || only.includes(t.realModelId))
    : TARGETS;

  console.log(
    `[PROBE] L2 上游实测：对 ${targets.length} 个模型各打一次真实 /images/generations` +
      `（size=${PROBE_SIZE}），会产生真实上游费用。`,
  );
  console.log();

  for (const t of targets) {
    const r = await probeUpstream(provider.baseUrl, apiKey, t.realModelId);
    if (r.ok) {
      console.log(
        `  [PASS] ${t.realModelId} → ${r.payload}` +
          `${r.bytes ? ` ${(r.bytes / 1024).toFixed(1)}KB` : ""}` +
          ` (${Math.round(r.latencyMs)}ms)`,
      );
    } else {
      console.log(`  [FAIL] ${t.realModelId} → ${r.error} (${Math.round(r.latencyMs)}ms)`);
    }
  }
  console.log();
  console.log("探测失败的模型不得 --apply；用 --only= 排除后再 apply。");
}

async function cli(): Promise<void> {
  const apply = process.argv.includes("--apply") || process.env.APPLY === "1";
  const probe = process.argv.includes("--probe");
  const only = parseOnly();
  const prisma = new PrismaClient();

  try {
    if (probe) {
      await runProbe(prisma, only);
      if (!apply) return;
      console.log();
    }

    console.log(
      apply
        ? "[APPLY] 幂等 upsert guangtech 图片通道（Model + Channel + Alias + Link）..."
        : "[DRY RUN] 不写库；读现状 + 打印将执行动作。加 --apply 真正写入，--probe 先测上游。",
    );
    console.log();

    const r = await provisionGuangtechImageChannels(prisma, { dryRun: !apply, only });

    console.log();
    for (const x of r.results) {
      console.log(`Summary: ${x.alias} action=${x.action}${x.reason ? ` reason=${x.reason}` : ""}`);
    }

    const imageAliases = await prisma.modelAlias.count({
      where: { modality: "IMAGE" as ModelModality, enabled: true },
    });
    console.log(`DB state: enabled IMAGE aliases=${imageAliases}`);
  } finally {
    await prisma.$disconnect();
  }
}

const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  /add-guangtech-image-channels\.ts$/.test(process.argv[1]);

if (isDirectRun) {
  cli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

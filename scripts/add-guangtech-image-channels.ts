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

import { Prisma, PrismaClient, type ModelModality } from "@prisma/client";
import { invalidateModelsListCache } from "../src/lib/cache/models-cache";
import { disconnectRedis } from "../src/lib/redis";

const PROVIDER_NAME = "guangtech";
const BRAND = "OpenAI";

/** 每张成本（USD）。见文件头「定价依据」——名义值，非 guangtech 真实进价。 */
const COST_PER_CALL_USD = 0.068836;
/** 每张售价（USD）。= openrouter `gpt-image` 别名现行实付价。 */
const SELL_PER_CALL_USD = 0.082603;

/** 探测用尺寸；也是 alias.capabilities.supported_sizes 的唯一声明值。 */
const PROBE_SIZE = "1024x1024";
/** channel.priority —— 受管字段，复跑须收敛（GTI-DEF-02） */
const CHANNEL_PRIORITY = 10;
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
 *
 * GTI-DEF-03：`supported_sizes` 此前被硬编码为 `[PROBE_SIZE]`，与上游实际返回
 * 无关 —— 生产上请求 1024x1024、实际回 1254x1254，元数据是假的。现在只有 probe
 * 实测到"请求尺寸 == 返回尺寸"才写入；未验证或不匹配则**整个字段不出现**，
 * 让 list_models 如实呈现"未知"而不是给出一个错的承诺。
 */
function buildCapabilities(verifiedSizes: string[]): Record<string, unknown> {
  const caps: Record<string, unknown> = {
    vision: false,
    json_mode: false,
    streaming: false,
    image_input: false,
    image_to_image: false,
    system_prompt: false,
    function_calling: false,
  };
  if (verifiedSizes.length > 0) caps.supported_sizes = verifiedSizes;
  return caps;
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

export interface ImageMeta {
  format: "png" | "jpeg" | "webp";
  width: number;
  height: number;
}

/**
 * 从图片字节里读出真实格式与像素尺寸。
 *
 * GTI-DEF-03：首版 probe 只统计 base64 解码后的字节数就判 PASS，等于只验证了
 * "上游回了点什么"，没验证"回的是不是我们声称的那个东西"。结果三张图请求
 * `1024x1024`、实际返回 `1254x1254`，而 alias 的 `supported_sizes` 照旧对外
 * 声明 `1024x1024` —— `list_models` / MCP 给出的能力元数据是失真的。
 *
 * 这与 seedream-3 的翻车是同一类：不能凭"上游有响应"推断"上游按我们的约定工作"。
 *
 * 解析头部即可，不引第三方依赖：
 *   PNG  — 8B 签名 + IHDR，width/height 为 offset 16/20 的大端 u32
 *   JPEG — 扫描 SOF0-3 / SOF5-7 / SOF9-11 段，height/width 在段内 +5/+7
 *   WebP — RIFF....WEBP，VP8 / VP8L / VP8X 三种子格式各自取尺寸
 * 无法识别时返回 null（调用方按"未验证"处理，绝不猜）。
 */
export function readImageMeta(buf: Buffer): ImageMeta | null {
  // ── PNG ──
  if (
    buf.length >= 24 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) &&
    buf.subarray(12, 16).toString("latin1") === "IHDR"
  ) {
    return { format: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // ── JPEG ──
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buf[offset + 1];
      // SOF0-3 / SOF5-7 / SOF9-11 携带尺寸；DHT(c4)/JPG(c8)/DAC(cc) 不是 SOF
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb);
      if (isSof) {
        return {
          format: "jpeg",
          height: buf.readUInt16BE(offset + 5),
          width: buf.readUInt16BE(offset + 7),
        };
      }
      // 无长度字段的独立标记（SOI/EOI/RSTn/TEM）直接跳过
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      offset += 2 + buf.readUInt16BE(offset + 2);
    }
    return null;
  }

  // ── WebP ──
  if (
    buf.length >= 30 &&
    buf.subarray(0, 4).toString("latin1") === "RIFF" &&
    buf.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    const sub = buf.subarray(12, 16).toString("latin1");
    if (sub === "VP8 ") {
      return {
        format: "webp",
        width: buf.readUInt16LE(26) & 0x3fff,
        height: buf.readUInt16LE(28) & 0x3fff,
      };
    }
    if (sub === "VP8L") {
      const bits = buf.readUInt32LE(21);
      return {
        format: "webp",
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
    if (sub === "VP8X") {
      return {
        format: "webp",
        width: (buf.readUIntLE(24, 3) & 0xffffff) + 1,
        height: (buf.readUIntLE(27, 3) & 0xffffff) + 1,
      };
    }
  }

  return null;
}

export interface ProbeOutcome {
  realModelId: string;
  ok: boolean;
  /** 'b64_json' | 'url' | null */
  payload: "b64_json" | "url" | null;
  bytes?: number;
  /** 实际解析出的格式与像素尺寸；无法解析（如上游只给 url）时为 null */
  meta?: ImageMeta | null;
  /** 请求的尺寸与实际返回是否一致 —— 决定能否把该尺寸写进 supported_sizes */
  sizeMatches?: boolean;
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

    const [reqW, reqH] = PROBE_SIZE.split("x").map(Number);

    const first = json.data?.[0];
    if (first?.b64_json) {
      const buf = Buffer.from(first.b64_json, "base64");
      const meta = readImageMeta(buf);
      // 解析不出尺寸 = 未验证，绝不当作"匹配"（宁可不声明能力，也不声明错的）
      const sizeMatches = meta !== null && meta.width === reqW && meta.height === reqH;
      return {
        realModelId,
        ok: meta !== null, // 拿到字节但不是可识别图片 → 不算 PASS
        payload: "b64_json",
        bytes: buf.byteLength,
        meta,
        sizeMatches,
        latencyMs: elapsed(),
        httpStatus: response.status,
        error: meta === null ? "response bytes are not a recognizable PNG/JPEG/WebP image" : undefined,
      };
    }
    if (first?.url) {
      // 上游只给 URL：本脚本不下载（避免二次外部依赖与超时），标记为未验证尺寸。
      return {
        realModelId,
        ok: true,
        payload: "url",
        meta: null,
        sizeMatches: false,
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
  opts: {
    dryRun?: boolean;
    only?: string[];
    logPrefix?: string;
    /**
     * GTI-DEF-03：realModelId → 已实测确认的尺寸列表。只有出现在这里的尺寸才会
     * 写进 alias.capabilities.supported_sizes。未跑 probe 时为空 Map ——
     * 此时不声明任何尺寸能力（宁可留空，也不沿用上一次的错误声明）。
     */
    verifiedSizes?: Map<string, string[]>;
  } = {},
): Promise<ProvisionResult> {
  const dryRun = opts.dryRun ?? true;
  const prefix = opts.logPrefix ?? "  ";
  const verifiedSizes = opts.verifiedSizes ?? new Map<string, string[]>();
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
        // GTI-DEF-02：`undefined` 在 Prisma 里是"别动这个字段"，导致漂移值
        // （如被人改成 ["512x512"]）复跑也拉不回来。规格声明 supportedSizes=null
        // 是**受管字段**，必须显式收敛。DbNull 写 SQL NULL（非 JSON null）。
        supportedSizes: Prisma.DbNull, // D4：不加硬拒，交由上游校验
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
        // GTI-DEF-02：priority 同为受管字段，复跑须收敛回规格值
        priority: CHANNEL_PRIORITY,
      },
      create: {
        providerId: provider.id,
        modelId: model.id,
        realModelId: t.realModelId,
        priority: CHANNEL_PRIORITY,
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
        capabilities: buildCapabilities(verifiedSizes.get(t.realModelId) ?? []),
        description: t.description,
      },
      create: {
        alias: t.alias,
        brand: BRAND,
        modality: "IMAGE" as ModelModality,
        enabled: true,
        deprecated: false,
        sellPrice: { unit: "call", perCall: SELL_PER_CALL_USD },
        capabilities: buildCapabilities(verifiedSizes.get(t.realModelId) ?? []),
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

async function runProbe(prisma: PrismaClient, only?: string[]): Promise<ProbeOutcome[]> {
  const provider = await prisma.provider.findUnique({
    where: { name: PROVIDER_NAME },
    select: { baseUrl: true, authConfig: true },
  });
  if (!provider) {
    console.log(`[probe] Provider '${PROVIDER_NAME}' 不存在，无法探测`);
    return [];
  }
  const apiKey = (provider.authConfig as { apiKey?: string } | null)?.apiKey;
  if (!apiKey) {
    console.log(`[probe] Provider '${PROVIDER_NAME}' 未配置 authConfig.apiKey，无法探测`);
    return [];
  }

  const targets = only?.length
    ? TARGETS.filter((t) => only.includes(t.alias) || only.includes(t.realModelId))
    : TARGETS;

  console.log(
    `[PROBE] L2 上游实测：对 ${targets.length} 个模型各打一次真实 /images/generations` +
      `（size=${PROBE_SIZE}），会产生真实上游费用。`,
  );
  console.log();

  const outcomes: ProbeOutcome[] = [];
  for (const t of targets) {
    const r = await probeUpstream(provider.baseUrl, apiKey, t.realModelId);
    outcomes.push(r);
    if (r.ok) {
      const dims = r.meta ? `${r.meta.format} ${r.meta.width}x${r.meta.height}` : "size unverified";
      const sizeNote = r.meta
        ? r.sizeMatches
          ? " == requested"
          : ` != requested ${PROBE_SIZE} → 不声明 supported_sizes`
        : "";
      console.log(
        `  [PASS] ${t.realModelId} → ${r.payload}` +
          `${r.bytes ? ` ${(r.bytes / 1024).toFixed(1)}KB` : ""}` +
          ` | ${dims}${sizeNote} (${Math.round(r.latencyMs)}ms)`,
      );
    } else {
      console.log(`  [FAIL] ${t.realModelId} → ${r.error} (${Math.round(r.latencyMs)}ms)`);
    }
  }
  console.log();
  return outcomes;
}

async function cli(): Promise<void> {
  const apply = process.argv.includes("--apply") || process.env.APPLY === "1";
  const probe = process.argv.includes("--probe");
  const only = parseOnly();
  const prisma = new PrismaClient();

  // GTI-DEF-01：首版把「探测失败的模型不得 apply」写成一句给人看的提示，CLI 自己
  // 完全不消费 probe 结果 —— 上游 502 后照样 [created] 并 exit 0。护栏写成文字
  // 就等于没有护栏（这恰是本批次 F-GTI-02 要修的同一个病根）。现在改成代码强制：
  // probe 结果决定 apply 的目标集合与退出码。
  let applyTargets = only;
  let verifiedSizes = new Map<string, string[]>();
  let probeFailures: ProbeOutcome[] = [];

  try {
    if (probe) {
      const outcomes = await runProbe(prisma, only);
      probeFailures = outcomes.filter((o) => !o.ok);
      const passed = outcomes.filter((o) => o.ok);

      verifiedSizes = new Map(
        passed.filter((o) => o.sizeMatches).map((o) => [o.realModelId, [PROBE_SIZE]]),
      );

      for (const f of probeFailures) {
        console.log(`[blocked] ${f.realModelId} 探测失败，不会落库：${f.error}`);
      }
      for (const p of passed.filter((o) => !o.sizeMatches)) {
        console.log(
          `[warn] ${p.realModelId} 可出图但返回尺寸` +
            `${p.meta ? ` ${p.meta.width}x${p.meta.height}` : "未知"}` +
            ` != 请求的 ${PROBE_SIZE} —— 落库但不声明 supported_sizes`,
        );
      }

      if (apply) {
        if (passed.length === 0) {
          console.error("[abort] 所有模型探测失败，不执行 apply。");
          process.exitCode = 1;
          return;
        }
        // 只 apply 明确探测成功的集合
        applyTargets = passed.map((o) => o.realModelId);
        console.log();
      } else {
        return;
      }
    }

    console.log(
      apply
        ? "[APPLY] 幂等 upsert guangtech 图片通道（Model + Channel + Alias + Link）..."
        : "[DRY RUN] 不写库；读现状 + 打印将执行动作。加 --apply 真正写入，--probe 先测上游。",
    );
    console.log();

    const r = await provisionGuangtechImageChannels(prisma, {
      dryRun: !apply,
      only: applyTargets,
      verifiedSizes,
    });

    console.log();
    for (const x of r.results) {
      console.log(`Summary: ${x.alias} action=${x.action}${x.reason ? ` reason=${x.reason}` : ""}`);
    }

    const imageAliases = await prisma.modelAlias.count({
      where: { modality: "IMAGE" as ModelModality, enabled: true },
    });
    console.log(`DB state: enabled IMAGE aliases=${imageAliases}`);

    // 新别名不清缓存就不会出现在 /v1/models 与 MCP list_models 里（路由本身走
    // 实时查询、不受影响，但"列不出来"同样是用户可见的半可用状态）。
    // 与 scripts/fix-guangtech-canonical-naming.ts 同款收尾。
    if (apply) {
      invalidateModelsListCache();
      console.log("models:list 缓存已失效");
    }

    // 有模型探测失败 → 非零退出，让调用方/CI 看得见部分失败，
    // 而不是靠人读 stdout（GTI-DEF-01）。
    if (probeFailures.length > 0) {
      console.error(
        `\n[exit 1] ${probeFailures.length} 个模型探测失败未落库：` +
          probeFailures.map((f) => f.realModelId).join(", "),
      );
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
    await disconnectRedis().catch(() => {});
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

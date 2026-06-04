/**
 * BL-IMG-SEEDREAM45 F-SD45-01 — 幂等接入 Seedream 4.5 图片模型。
 *
 * 在 volcengine provider 下 upsert：Model `seedream-4-5` + Channel（realModelId=
 * 火山在线推理接入点 ep-ID）+ ModelAlias `seedream-4-5` + AliasModelLink。
 * 复用 scripts/seed-embedding-models.ts 的 upsert 范式（provider 必须已存在，不创建）。
 *
 * 背景：BL-IMG-PERSIST-GCS fix_round2 下线了 seedream-3（realModelId 未配 ep-ID
 * 恒 404 + 火山下线名单）。用户裁决改接最新 Seedream 4.5。
 *
 * 用法：
 *   # dry-run（默认，不写库，仅读现状 + 打印将执行动作）
 *   npx tsx scripts/add-seedream-45.ts
 *
 *   # 真正写库
 *   npx tsx scripts/add-seedream-45.ts --apply
 *   APPLY=1 npx tsx scripts/add-seedream-45.ts
 *
 *   # 覆盖 ep-ID（默认用下方常量）
 *   SEEDREAM45_ENDPOINT_ID=ep-xxxx npx tsx scripts/add-seedream-45.ts --apply
 *
 * 先决条件（用户 ops，见 docs/specs/BL-IMG-SEEDREAM45-ops.md）：
 *   1) 火山方舟控制台已开通 Seedream 4.5 + 创建在线推理接入点拿 ep-ID
 *   2) Provider 'volcengine' 已存在（base seed 创建过，ProviderConfig.imageViaChat=true,
 *      currency=CNY，adapterType=volcengine）—— 本脚本不动 ProviderConfig
 *
 * 定价依据（D5）：
 *   - costPrice.perCall = ¥0.20/张（火山 Seedream 4.0+ 官方价，ADR-005 §四）
 *   - sellPrice.perCall = ¥0.24/张（1.2x markup，与 embedding/DEFAULT markup 惯例一致）
 *   - provider currency=CNY → calculateCallCost 自动 × EXCHANGE_RATE_CNY_TO_USD
 *   - sellPrice 倍率待 admin 确认，可后续在 /admin/model-aliases 调整
 *
 * 尺寸（D6）：supportedSizes=null —— Seedream 4.5 接受 1K/2K/4K + 像素，
 *   volcengine adapter 已有尺寸回退（默认→1024x1024→2048x2048）；置 null 跳过
 *   预校验避免误拒（与 gpt-image 一致）。生产验证后可在 admin 收紧。
 *
 * capabilities=null —— 由管理员在控制台配置（MCP 约定：capabilities 由管理员配置）。
 */

import { PrismaClient, type ModelModality } from "@prisma/client";

const MODEL_NAME = "seedream-4-5";
const ALIAS_NAME = "seedream-4-5";
const PROVIDER_NAME = "volcengine";
const BRAND = "ByteDance";
const DISPLAY_NAME = "Seedream 4.5";
const DESCRIPTION =
  "ByteDance Seedream 4.5 image generation model (doubao-seedream-4-5-251128). " +
  "Strong at multi-image composition, poster layout and high-fidelity text-in-image. Hosted on Volcengine Ark.";

// 火山在线推理接入点 ep-ID（用户 2026-06-04 创建）。可用 env 覆盖。
const DEFAULT_ENDPOINT_ID = "ep-20260604162024-k2sbk";

const COST_PER_CALL_CNY = 0.2; // ¥0.20/张
const SELL_PER_CALL_CNY = 0.24; // 1.2x markup

export interface SeedreamResult {
  action: "created" | "updated" | "skipped";
  reason?: string;
  modelId?: string;
  channelId?: string;
  aliasId?: string;
  epId: string;
}

/**
 * 幂等 upsert Seedream 4.5（Model + Channel + Alias + Link）。
 * Provider 必须已存在（不创建）；缺失时返回 skipped。
 * dryRun=true 时不写库，仅读现状 + 打印意图。
 */
export async function seedSeedream45(
  prisma: PrismaClient,
  opts: { dryRun?: boolean; epId?: string; logPrefix?: string } = {},
): Promise<SeedreamResult> {
  const dryRun = opts.dryRun ?? true;
  const epId = opts.epId ?? process.env.SEEDREAM45_ENDPOINT_ID ?? DEFAULT_ENDPOINT_ID;
  const prefix = opts.logPrefix ?? "  ";

  if (!epId || !epId.startsWith("ep-")) {
    console.log(
      `${prefix}[skip] 无效 ep-ID '${epId}' —— 火山引擎须用在线推理接入点 ID（ep-xxx）。` +
        ` 见 docs/specs/BL-IMG-SEEDREAM45-ops.md`,
    );
    return { action: "skipped", reason: "invalid_ep_id", epId };
  }

  const provider = await prisma.provider.findUnique({
    where: { name: PROVIDER_NAME },
    include: { config: { select: { imageViaChat: true, currency: true } } },
  });
  if (!provider) {
    console.log(`${prefix}[skip] Provider '${PROVIDER_NAME}' 不存在 —— 先跑 base seed`);
    return { action: "skipped", reason: "provider_missing", epId };
  }

  // 校验 provider 级配置（不修改，仅告警）
  if (provider.config?.imageViaChat !== true) {
    console.log(
      `${prefix}[warn] volcengine ProviderConfig.imageViaChat=${provider.config?.imageViaChat} ` +
        `(期望 true，Seedream 走 chat 接口)。如生成失败请在 admin 检查。`,
    );
  }
  if (provider.config?.currency !== "CNY") {
    console.log(
      `${prefix}[warn] volcengine ProviderConfig.currency=${provider.config?.currency} ` +
        `(期望 CNY，否则 ¥ 定价不会按汇率换算)。`,
    );
  }

  const existingModel = await prisma.model.findUnique({
    where: { name: MODEL_NAME },
    select: { id: true },
  });

  if (dryRun) {
    console.log(
      `${prefix}[dry-run] ${MODEL_NAME} → ${PROVIDER_NAME}/${epId}` +
        ` (${existingModel ? "UPDATE" : "CREATE"})` +
        ` cost=¥${COST_PER_CALL_CNY}/张 sell=¥${SELL_PER_CALL_CNY}/张`,
    );
    return { action: existingModel ? "updated" : "created", reason: "dry_run", epId };
  }

  const model = await prisma.model.upsert({
    where: { name: MODEL_NAME },
    update: {
      displayName: DISPLAY_NAME,
      description: DESCRIPTION,
      modality: "IMAGE" as ModelModality,
      enabled: true,
      // supportedSizes / capabilities 留给 admin 配置，不在此覆盖
    },
    create: {
      name: MODEL_NAME,
      displayName: DISPLAY_NAME,
      description: DESCRIPTION,
      modality: "IMAGE" as ModelModality,
      enabled: true,
      supportedSizes: undefined,
      capabilities: undefined,
    },
  });

  const channel = await prisma.channel.upsert({
    where: {
      providerId_modelId: { providerId: provider.id, modelId: model.id },
    },
    update: {
      realModelId: epId,
      costPrice: { perCall: COST_PER_CALL_CNY },
      sellPrice: { perCall: SELL_PER_CALL_CNY },
      status: "ACTIVE",
    },
    create: {
      providerId: provider.id,
      modelId: model.id,
      realModelId: epId,
      priority: 1,
      costPrice: { perCall: COST_PER_CALL_CNY },
      sellPrice: { perCall: SELL_PER_CALL_CNY },
      status: "ACTIVE",
    },
  });

  const alias = await prisma.modelAlias.upsert({
    where: { alias: ALIAS_NAME },
    update: {
      brand: BRAND,
      modality: "IMAGE" as ModelModality,
      enabled: true,
      deprecated: false,
      sellPrice: { perCall: SELL_PER_CALL_CNY },
      description: DESCRIPTION,
    },
    create: {
      alias: ALIAS_NAME,
      brand: BRAND,
      modality: "IMAGE" as ModelModality,
      enabled: true,
      deprecated: false,
      sellPrice: { perCall: SELL_PER_CALL_CNY },
      description: DESCRIPTION,
    },
  });

  await prisma.aliasModelLink.upsert({
    where: { aliasId_modelId: { aliasId: alias.id, modelId: model.id } },
    update: {},
    create: { aliasId: alias.id, modelId: model.id },
  });

  const action: SeedreamResult["action"] = existingModel ? "updated" : "created";
  console.log(`${prefix}[${action}] ${MODEL_NAME} → ${PROVIDER_NAME}/${epId}`);
  return { action, modelId: model.id, channelId: channel.id, aliasId: alias.id, epId };
}

// ----------------------------------------------------------------
// Standalone CLI 入口
// ----------------------------------------------------------------
async function cli(): Promise<void> {
  const apply = process.argv.includes("--apply") || process.env.APPLY === "1";
  const dryRun = !apply;
  const prisma = new PrismaClient();
  console.log(
    dryRun
      ? "[DRY RUN] 不写库；读现状 + 打印将执行动作。加 --apply 真正写入。"
      : "[APPLY] 幂等 upsert Seedream 4.5（Model + Channel + Alias + Link）...",
  );
  console.log();
  try {
    const r = await seedSeedream45(prisma, { dryRun });
    console.log();
    console.log(`Summary: action=${r.action}${r.reason ? ` reason=${r.reason}` : ""} ep=${r.epId}`);
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
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  process.argv[1].endsWith("add-seedream-45.ts");

if (isDirectRun) {
  cli().catch((err) => {
    console.error("[add-seedream-45] failed:", err);
    process.exitCode = 1;
  });
}

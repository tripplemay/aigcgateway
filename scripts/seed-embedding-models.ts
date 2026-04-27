/**
 * BL-EMBEDDING-MVP F-EM-04 fix-round-1 — 独立 embedding seed 脚本（idempotent）。
 *
 * 抽离自 prisma/seed.ts，仅 upsert embedding 相关 model + channel + alias，
 * 不动 Provider / SystemConfig / 其他 modality 的现有数据。
 *
 * 用途：
 *   - 生产环境：deploy workflow 不自动跑 db seed（避免覆盖管理员手动调过的
 *     ProviderConfig）；但 embedding modality 引入需要新数据，独立脚本可
 *     在 SSH 上单独运行而不触碰其他配置
 *   - 本地：与 prisma/seed.ts 共用同一份 seedEmbeddingModels 函数（avoid
 *     双源维护）
 *
 * 用法：
 *   npx tsx scripts/seed-embedding-models.ts
 *
 *   # 仅模拟（dry-run，不写入；显示将要做什么）
 *   DRY_RUN=1 npx tsx scripts/seed-embedding-models.ts
 *
 * 先决条件：
 *   1) ModelModality enum 含 'EMBEDDING'（migration 20260428_embedding_modality 已应用）
 *   2) Provider 'siliconflow' 与 'openai' 已存在（base seed 创建过）
 *
 * 价格依据：spec § F-EM-04（spec 默认值）
 *   - bge-m3 SiliconFlow ¥0.5/M ≈ $0.07/M（CNY→USD 0.137）
 *   - text-embedding-3-small OpenAI $0.02/M
 *   - markup 1.2x 与 DEFAULT_MARKUP_RATIO 一致
 */

import { PrismaClient, type ModelModality } from "@prisma/client";

export interface EmbeddingSeed {
  modelName: string;
  displayName: string;
  description: string;
  contextWindow: number;
  providerName: string;
  realModelId: string;
  costInputPer1M: number;
  sellInputPer1M: number;
  brand: string;
}

export const EMBEDDING_SEEDS: EmbeddingSeed[] = [
  {
    modelName: "bge-m3",
    displayName: "BGE-M3",
    description:
      "Multilingual embedding model by BAAI (1024 dims). Optimized for Chinese/Japanese/Korean. Hosted on SiliconFlow.",
    contextWindow: 8192,
    providerName: "siliconflow",
    realModelId: "BAAI/bge-m3",
    costInputPer1M: 0.07, // ¥0.5/M ÷ 7.3 ≈ $0.0685, round to 0.07
    sellInputPer1M: 0.084, // 1.2x markup
    brand: "BAAI",
  },
  {
    modelName: "text-embedding-3-small",
    displayName: "OpenAI text-embedding-3-small",
    description:
      "Compact, performant English-first embedding model (1536 dims). Hosted on OpenAI.",
    contextWindow: 8191,
    providerName: "openai",
    realModelId: "text-embedding-3-small",
    costInputPer1M: 0.02,
    sellInputPer1M: 0.024, // 1.2x markup
    brand: "OpenAI",
  },
];

export interface SeedResult {
  created: number;
  updated: number;
  skipped: number;
  finalModels: number;
  finalAliases: number;
}

/**
 * 幂等 upsert 给定 embedding seed 列表到 Model + Channel + ModelAlias +
 * AliasModelLink。Provider 必须已存在（不创建）；缺失时跳过该条并 log。
 *
 * 返回执行摘要。dryRun=true 时不写入，仅打印将要执行的动作 + 当前状态读取。
 */
export async function seedEmbeddingModels(
  prisma: PrismaClient,
  opts: { seeds?: EmbeddingSeed[]; dryRun?: boolean; logPrefix?: string } = {},
): Promise<SeedResult> {
  const seeds = opts.seeds ?? EMBEDDING_SEEDS;
  const dryRun = opts.dryRun ?? false;
  const prefix = opts.logPrefix ?? "  ";

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const def of seeds) {
    const provider = await prisma.provider.findUnique({
      where: { name: def.providerName },
    });
    if (!provider) {
      console.log(
        `${prefix}[skip] Provider '${def.providerName}' not found — run base seed first`,
      );
      skipped++;
      continue;
    }

    const existingModel = await prisma.model.findUnique({
      where: { name: def.modelName },
      select: { id: true },
    });

    if (dryRun) {
      console.log(
        `${prefix}[dry-run] ${def.modelName} → ${def.providerName}/${def.realModelId}` +
          ` (${existingModel ? "UPDATE" : "CREATE"})`,
      );
      continue;
    }

    const model = await prisma.model.upsert({
      where: { name: def.modelName },
      update: {
        displayName: def.displayName,
        description: def.description,
        modality: "EMBEDDING" as ModelModality,
        contextWindow: def.contextWindow,
        enabled: true,
      },
      create: {
        name: def.modelName,
        displayName: def.displayName,
        description: def.description,
        modality: "EMBEDDING" as ModelModality,
        contextWindow: def.contextWindow,
        enabled: true,
      },
    });

    await prisma.channel.upsert({
      where: {
        providerId_modelId: { providerId: provider.id, modelId: model.id },
      },
      update: {
        realModelId: def.realModelId,
        costPrice: { unit: "token", inputPer1M: def.costInputPer1M, outputPer1M: 0 },
        sellPrice: { unit: "token", inputPer1M: def.sellInputPer1M, outputPer1M: 0 },
        status: "ACTIVE",
      },
      create: {
        providerId: provider.id,
        modelId: model.id,
        realModelId: def.realModelId,
        priority: 1,
        costPrice: { unit: "token", inputPer1M: def.costInputPer1M, outputPer1M: 0 },
        sellPrice: { unit: "token", inputPer1M: def.sellInputPer1M, outputPer1M: 0 },
        status: "ACTIVE",
      },
    });

    const alias = await prisma.modelAlias.upsert({
      where: { alias: def.modelName },
      update: {
        enabled: true,
        modality: "EMBEDDING" as ModelModality,
        contextWindow: def.contextWindow,
        sellPrice: { unit: "token", inputPer1M: def.sellInputPer1M, outputPer1M: 0 },
      },
      create: {
        alias: def.modelName,
        brand: def.brand,
        modality: "EMBEDDING" as ModelModality,
        enabled: true,
        contextWindow: def.contextWindow,
        sellPrice: { unit: "token", inputPer1M: def.sellInputPer1M, outputPer1M: 0 },
        description: def.description,
      },
    });

    await prisma.aliasModelLink.upsert({
      where: { aliasId_modelId: { aliasId: alias.id, modelId: model.id } },
      update: {},
      create: { aliasId: alias.id, modelId: model.id },
    });

    if (existingModel) {
      console.log(`${prefix}[updated] ${def.modelName} → ${def.providerName}/${def.realModelId}`);
      updated++;
    } else {
      console.log(`${prefix}[created] ${def.modelName} → ${def.providerName}/${def.realModelId}`);
      created++;
    }
  }

  // 最终读 DB 状态作为输出（即使 dry-run 也读，方便诊断）
  const finalModels = await prisma.model.count({
    where: { modality: "EMBEDDING" as ModelModality },
  });
  const finalAliases = await prisma.modelAlias.count({
    where: { modality: "EMBEDDING" as ModelModality },
  });

  return { created, updated, skipped, finalModels, finalAliases };
}

// ----------------------------------------------------------------
// Standalone CLI 入口（npx tsx scripts/seed-embedding-models.ts）
// ----------------------------------------------------------------
async function cli(): Promise<void> {
  const dryRun = process.env.DRY_RUN === "1";
  const prisma = new PrismaClient();
  console.log(
    dryRun
      ? "[DRY RUN] No DB writes; reporting current state + intended changes"
      : "Seeding embedding models (idempotent upsert)...",
  );
  console.log();
  try {
    const r = await seedEmbeddingModels(prisma, { dryRun });
    console.log();
    console.log(
      `Summary: created=${r.created} updated=${r.updated} skipped=${r.skipped}`,
    );
    console.log(
      `DB state: embedding models=${r.finalModels} embedding aliases=${r.finalAliases}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// 仅当作为脚本直接运行时执行 cli（被 import 时不触发）
const isDirectRun =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  process.argv[1].endsWith("seed-embedding-models.ts");

if (isDirectRun) {
  cli().catch((err) => {
    console.error("[seed-embedding-models] failed:", err);
    process.exitCode = 1;
  });
}

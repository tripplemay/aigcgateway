/**
 * A1 存量数据一次性修正（统一入口）
 *
 * 按顺序执行：
 * 1. fix-alias-modality — 修正别名 modality（IMAGE 模型别名改为 IMAGE）
 * 2. fix-alias-context-window — 补齐别名 contextWindow/maxTokens
 * 3. fix-brand-duplicates — 合并重复品牌变体
 *
 * 用法：
 *   npx tsx scripts/fix-a1-all.ts --dry-run   # 预览，不写入
 *   npx tsx scripts/fix-a1-all.ts              # 实际执行
 */

import { PrismaClient, type ModelModality } from "@prisma/client";

const prisma = new PrismaClient();

const BRAND_MERGE_MAP: Record<string, string> = {
  "智谱 AI": "智谱AI",
  "Zhipu AI": "智谱AI",
  zhipu: "智谱AI",
  "Arcee AI": "Arcee",
  arcee: "Arcee",
  deepseek: "DeepSeek",
  Deepseek: "DeepSeek",
  openai: "OpenAI",
  Openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  meta: "Meta",
  mistral: "Mistral",
  "Mistral AI": "Mistral",
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("[dry-run] No changes will be written\n");

  // ── Step 1: Fix alias modality ──
  console.log("=== Step 1: Fix alias modality ===");
  const aliases = await prisma.modelAlias.findMany({
    select: {
      id: true,
      alias: true,
      modality: true,
      contextWindow: true,
      maxTokens: true,
      brand: true,
      models: {
        select: {
          model: {
            select: { modality: true, contextWindow: true, maxTokens: true },
          },
        },
      },
    },
  });

  let fixedModality = 0;
  for (const alias of aliases) {
    const modelModalities = new Set(alias.models.map((l) => l.model.modality));
    if (modelModalities.size === 0) continue;

    let targetModality: ModelModality | null = null;
    if (modelModalities.size === 1) {
      const only = [...modelModalities][0];
      if (only !== alias.modality) targetModality = only;
    } else {
      const counts: Record<string, number> = {};
      for (const link of alias.models) {
        const m = link.model.modality;
        counts[m] = (counts[m] ?? 0) + 1;
      }
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const dominant = sorted[0][0] as ModelModality;
      if (dominant !== alias.modality) targetModality = dominant;
    }

    if (targetModality) {
      console.log(
        `  ${alias.alias}: ${alias.modality} → ${targetModality} (${alias.models.length} models)`,
      );
      if (!dryRun) {
        await prisma.modelAlias.update({
          where: { id: alias.id },
          data: { modality: targetModality },
        });
      }
      fixedModality++;
    }
  }
  console.log(`  → ${fixedModality} aliases modality fixed\n`);

  // ── Step 2: Fix contextWindow/maxTokens ──
  console.log("=== Step 2: Fix contextWindow/maxTokens ===");
  let fixedCw = 0;
  let fixedMt = 0;
  for (const alias of aliases) {
    const updates: Record<string, number> = {};

    if (alias.contextWindow == null) {
      const cwValues = alias.models
        .map((l) => l.model.contextWindow)
        .filter((v): v is number => v != null);
      if (cwValues.length > 0) {
        updates.contextWindow = Math.max(...cwValues);
        fixedCw++;
      }
    }

    if (alias.maxTokens == null) {
      const mtValues = alias.models
        .map((l) => l.model.maxTokens)
        .filter((v): v is number => v != null);
      if (mtValues.length > 0) {
        updates.maxTokens = Math.max(...mtValues);
        fixedMt++;
      }
    }

    if (Object.keys(updates).length > 0) {
      console.log(
        `  ${alias.alias}: ${Object.entries(updates).map(([k, v]) => `${k}=${v}`).join(", ")}`,
      );
      if (!dryRun) {
        await prisma.modelAlias.update({
          where: { id: alias.id },
          data: updates,
        });
      }
    }
  }
  console.log(`  → ${fixedCw} contextWindow + ${fixedMt} maxTokens fixed\n`);

  // ── Step 3: Fix brand duplicates ──
  console.log("=== Step 3: Fix brand duplicates ===");
  let fixedBrand = 0;
  for (const alias of aliases) {
    if (!alias.brand) continue;
    const canonical = BRAND_MERGE_MAP[alias.brand];
    if (canonical && canonical !== alias.brand) {
      console.log(`  ${alias.alias}: "${alias.brand}" → "${canonical}"`);
      if (!dryRun) {
        await prisma.modelAlias.update({
          where: { id: alias.id },
          data: { brand: canonical },
        });
      }
      fixedBrand++;
    }
  }
  console.log(`  → ${fixedBrand} brand duplicates fixed\n`);

  console.log("=== Summary ===");
  console.log(
    `modality: ${fixedModality}, contextWindow: ${fixedCw}, maxTokens: ${fixedMt}, brand: ${fixedBrand}`,
  );
  if (dryRun) console.log("(dry-run, no changes written)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

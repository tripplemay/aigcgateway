/**
 * F-DP-06 数据修正脚本
 *
 * 修正以下模型数据：
 * 1. deepseek-r1: capabilities.function_calling → true（根据实际能力）
 * 2. grok-4.1-fast: contextWindow → 2000000（2M tokens，根据 xAI 文档）
 * 3. minimax-m2.5: contextWindow → 1000000（1M tokens，根据 MiniMax 文档）
 *
 * 幂等：可重复执行，已有正确值的别名不会被覆盖
 *
 * 用法：
 *   npx tsx scripts/fix-dp-06-model-data.ts          # dry-run
 *   npx tsx scripts/fix-dp-06-model-data.ts --apply   # 实际执行
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dryRun = !process.argv.includes("--apply");

interface Fix {
  alias: string;
  patch: Record<string, unknown>;
  description: string;
}

const FIXES: Fix[] = [
  {
    alias: "deepseek-r1",
    patch: {
      // merge into existing capabilities
      capabilitiesPatch: { function_calling: true },
    },
    description: "enable function_calling capability",
  },
  {
    alias: "grok-4.1-fast",
    patch: { contextWindow: 2_000_000 },
    description: "set contextWindow to 2M",
  },
  {
    alias: "minimax-m2.5",
    patch: { contextWindow: 1_000_000 },
    description: "set contextWindow to 1M",
  },
];

async function main() {
  console.log(dryRun ? "[DRY RUN] 只报告" : "[APPLY] 将实际修改\n");
  let fixed = 0;
  let skipped = 0;
  let notFound = 0;

  for (const fix of FIXES) {
    const alias = await prisma.modelAlias.findUnique({
      where: { alias: fix.alias },
    });
    if (!alias) {
      console.log(`  NOT_FOUND  ${fix.alias} — skip`);
      notFound++;
      continue;
    }

    const updateData: Record<string, unknown> = {};
    const capPatch = (fix.patch as { capabilitiesPatch?: Record<string, unknown> })
      .capabilitiesPatch;

    if (capPatch) {
      const existingCaps = (alias.capabilities as Record<string, unknown> | null) ?? {};
      const needsUpdate = Object.entries(capPatch).some(([k, v]) => existingCaps[k] !== v);
      if (needsUpdate) {
        updateData.capabilities = { ...existingCaps, ...capPatch };
      }
    }

    if (fix.patch.contextWindow !== undefined && alias.contextWindow !== fix.patch.contextWindow) {
      updateData.contextWindow = fix.patch.contextWindow;
    }

    if (Object.keys(updateData).length === 0) {
      console.log(`  SKIP       ${fix.alias} — already correct`);
      skipped++;
      continue;
    }

    console.log(`  FIX        ${fix.alias} — ${fix.description}`);
    console.log(`             patch: ${JSON.stringify(updateData)}`);

    if (!dryRun) {
      await prisma.modelAlias.update({
        where: { id: alias.id },
        data: updateData,
      });
    }
    fixed++;
  }

  console.log(`\n--- 汇总 ---`);
  console.log(`修正: ${fixed}, 跳过(已正确): ${skipped}, 未找到: ${notFound}`);
  if (dryRun && fixed > 0) {
    console.log(`\n加 --apply 实际执行: npx tsx scripts/fix-dp-06-model-data.ts --apply`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

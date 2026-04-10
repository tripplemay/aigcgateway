/**
 * 一次性脚本：修正别名 modality
 *
 * 逻辑：对每个 ModelAlias，查其关联的 Model。
 * 如果关联 Model 中存在 IMAGE 模型，且别名 modality 为 TEXT，则修正为 IMAGE。
 * 同时处理 VIDEO/AUDIO 等非 TEXT modality。
 *
 * 用法：npx tsx scripts/fix-alias-modality.ts [--dry-run]
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("[dry-run] No changes will be written\n");

  const aliases = await prisma.modelAlias.findMany({
    select: {
      id: true,
      alias: true,
      modality: true,
      models: {
        select: {
          model: {
            select: { modality: true },
          },
        },
      },
    },
  });

  let fixed = 0;

  for (const alias of aliases) {
    const modelModalities = new Set(alias.models.map((l) => l.model.modality));

    // 如果所有关联 Model 一致且与别名不同 → 修正
    // 如果混合 modality → 以多数 Model 的 modality 为准
    if (modelModalities.size === 0) continue;

    let targetModality: string | null = null;

    if (modelModalities.size === 1) {
      const only = [...modelModalities][0];
      if (only !== alias.modality) {
        targetModality = only;
      }
    } else {
      // 混合情况：统计各 modality 的 Model 数量，取最多的
      const counts: Record<string, number> = {};
      for (const link of alias.models) {
        const m = link.model.modality;
        counts[m] = (counts[m] ?? 0) + 1;
      }
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const dominant = sorted[0][0];
      if (dominant !== alias.modality) {
        targetModality = dominant;
      }
    }

    if (targetModality) {
      console.log(
        `${alias.alias}: ${alias.modality} → ${targetModality} (${alias.models.length} models)`,
      );
      if (!dryRun) {
        await prisma.modelAlias.update({
          where: { id: alias.id },
          data: { modality: targetModality as "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" },
        });
      }
      fixed++;
    }
  }

  console.log(`\nTotal: ${fixed} aliases ${dryRun ? "would be" : ""} fixed`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
